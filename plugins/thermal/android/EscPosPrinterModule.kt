package com.syconik801.jsaapp

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothSocket
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.OutputStream
import java.util.UUID

/**
 * Generic ESC/POS Bluetooth thermal printer module.
 * Renders a PDF to a monochrome bitmap, converts to ESC/POS raster commands,
 * and sends over Bluetooth RFCOMM (SPP). Works with Epson, Star, Zebra (ESC/POS mode),
 * and most generic thermal printers.
 */
class EscPosPrinterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "EscPosPrinter"
        // Standard SPP UUID for Bluetooth serial port
        private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private const val CONNECT_TIMEOUT_MS = 10_000L
        private const val PRINT_TIMEOUT_MS = 30_000L
    }

    override fun getName(): String = "EscPosPrinter"

    /**
     * Print a PDF file via ESC/POS raster commands over Bluetooth.
     * @param macAddress Bluetooth MAC address of the printer
     * @param pdfPath Path to the PDF file (file:// prefix stripped)
     * @param paperWidth Paper width in inches (2, 3, or 4)
     * @param dpi Printer DPI (default 203 for most thermal printers)
     */
    @ReactMethod
    fun printPDF(macAddress: String, pdfPath: String, paperWidth: Double, dpi: Int, pageIndex: Int, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val cleanPath = pdfPath.replace("file://", "")
                val pdfFile = File(cleanPath)
                if (!pdfFile.exists()) {
                    withContext(Dispatchers.Main) {
                        promise.reject("FILE_ERROR", "PDF file not found: $cleanPath")
                    }
                    return@launch
                }

                Log.i(TAG, "printPDF: rendering PDF to bitmap (paper=${paperWidth}\", dpi=$dpi)")

                // Step 1: Render PDF page 0 to bitmap
                val pw = if (paperWidth > 0) paperWidth else 4.0
                val actualDpi = if (dpi > 0) dpi else 203
                val widthPx = (pw * actualDpi).toInt()

                val pfd = ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = PdfRenderer(pfd)
                val page = renderer.openPage(pageIndex)

                // Scale to fill paper width, proportional height
                val scale = widthPx.toFloat() / page.width.toFloat()
                val heightPx = (page.height * scale).toInt()

                val bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                page.close()
                renderer.close()
                pfd.close()

                // Trim trailing whitespace from bottom of bitmap to prevent extra paper feed
                val originalHeight = bitmap.height
                val trimmed = trimBottomWhitespace(bitmap, 40)
                val printBitmap: Bitmap
                if (trimmed !== bitmap) {
                    bitmap.recycle()
                    printBitmap = trimmed
                } else {
                    printBitmap = bitmap
                }
                Log.i(TAG, "printPDF: trimmed ${originalHeight}px → ${printBitmap.height}px, converting to ESC/POS raster")

                // Step 2: Convert bitmap to ESC/POS raster data
                val escPosData = bitmapToEscPosRaster(printBitmap, widthPx)
                printBitmap.recycle()

                Log.i(TAG, "printPDF: ESC/POS data ${escPosData.size} bytes, connecting to $macAddress")

                // Step 3: Send over Bluetooth RFCOMM
                val adapter = BluetoothAdapter.getDefaultAdapter()
                if (adapter == null || !adapter.isEnabled) {
                    withContext(Dispatchers.Main) {
                        promise.reject("BT_ERROR", "Bluetooth is not available or turned off")
                    }
                    return@launch
                }

                val device = adapter.getRemoteDevice(macAddress)
                var socket: BluetoothSocket? = null

                try {
                    // Try secure RFCOMM first, then insecure
                    socket = try {
                        device.createRfcommSocketToServiceRecord(SPP_UUID).also { it.connect() }
                    } catch (e: Exception) {
                        Log.w(TAG, "Secure RFCOMM failed, trying insecure: ${e.message}")
                        device.createInsecureRfcommSocketToServiceRecord(SPP_UUID).also { it.connect() }
                    }

                    Log.i(TAG, "printPDF: connected, sending ${escPosData.size} bytes")
                    val output: OutputStream = socket.outputStream

                    // Send initialization
                    output.write(byteArrayOf(0x1B, 0x40)) // ESC @ — Initialize printer

                    // Send raster data in chunks to avoid BT buffer overflow
                    val chunkSize = 4096
                    var offset = 0
                    while (offset < escPosData.size) {
                        val end = minOf(offset + chunkSize, escPosData.size)
                        output.write(escPosData, offset, end - offset)
                        output.flush()
                        offset = end
                        // Small delay between chunks for slower printers
                        if (offset < escPosData.size) delay(10)
                    }

                    // Feed and cut (minimal feed — bitmap already trimmed close to content)
                    output.write(byteArrayOf(0x1B, 0x64, 0x02)) // ESC d 2 — Feed 2 lines
                    output.write(byteArrayOf(0x1D, 0x56, 0x00)) // GS V 0 — Full cut (if supported)
                    output.flush()

                    Log.i(TAG, "printPDF: print complete!")
                    withContext(Dispatchers.Main) {
                        promise.resolve("Print successful")
                    }
                } finally {
                    try { socket?.close() } catch (_: Exception) {}
                }

            } catch (e: Exception) {
                Log.e(TAG, "printPDF error: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    promise.reject("PRINT_ERROR", e.message ?: "Unknown print error")
                }
            }
        }
    }

    /**
     * Scan a bitmap from the bottom up and crop trailing whitespace.
     * Returns a new (smaller) bitmap if whitespace was found, or the
     * original bitmap if there's nothing significant to trim.
     */
    private fun trimBottomWhitespace(src: Bitmap, paddingPx: Int = 40): Bitmap {
        val width = src.width
        val height = src.height
        val rowPixels = IntArray(width)
        var lastContentRow = 0

        for (y in (height - 1) downTo 0) {
            src.getPixels(rowPixels, 0, width, 0, y, width, 1)
            var hasContent = false
            var x = 0
            while (x < width) {
                val p = rowPixels[x]
                if (Color.red(p) < 250 || Color.green(p) < 250 || Color.blue(p) < 250) {
                    hasContent = true
                    break
                }
                x += 4
            }
            if (hasContent) {
                lastContentRow = y
                break
            }
        }

        val trimmedHeight = minOf(lastContentRow + paddingPx, height)
        if (height - trimmedHeight < 50) return src

        return Bitmap.createBitmap(src, 0, 0, width, trimmedHeight)
    }

    /**
     * Convert a bitmap to ESC/POS raster image format (GS v 0).
     * The bitmap is converted to monochrome (1-bit) using Floyd-Steinberg dithering,
     * then packed into the ESC/POS raster command format.
     */
    private fun bitmapToEscPosRaster(bitmap: Bitmap, widthPx: Int): ByteArray {
        val height = bitmap.height
        // Width must be a multiple of 8 for byte packing
        val byteWidth = (widthPx + 7) / 8
        val alignedWidth = byteWidth * 8

        // Get pixels and convert to grayscale with dithering
        val pixels = IntArray(widthPx * height)
        bitmap.getPixels(pixels, 0, widthPx, 0, 0, widthPx, height)

        // Floyd-Steinberg dithering to monochrome
        val gray = FloatArray(widthPx * height)
        for (i in pixels.indices) {
            val r = Color.red(pixels[i])
            val g = Color.green(pixels[i])
            val b = Color.blue(pixels[i])
            gray[i] = (0.299f * r + 0.587f * g + 0.114f * b)
        }

        val mono = BooleanArray(alignedWidth * height) // true = black dot
        for (y in 0 until height) {
            for (x in 0 until widthPx) {
                val idx = y * widthPx + x
                val oldPixel = gray[idx]
                val newPixel = if (oldPixel < 128f) 0f else 255f
                mono[y * alignedWidth + x] = newPixel == 0f
                val error = oldPixel - newPixel
                // Distribute error to neighbors
                if (x + 1 < widthPx) gray[idx + 1] += error * 7f / 16f
                if (y + 1 < height) {
                    if (x > 0) gray[idx + widthPx - 1] += error * 3f / 16f
                    gray[idx + widthPx] += error * 5f / 16f
                    if (x + 1 < widthPx) gray[idx + widthPx + 1] += error * 1f / 16f
                }
            }
        }

        // Build ESC/POS raster command: GS v 0
        val baos = ByteArrayOutputStream()

        // GS v 0 m xL xH yL yH d1...dk
        // m = 0 (normal), xL xH = width in bytes, yL yH = height in dots
        baos.write(byteArrayOf(
            0x1D, 0x76, 0x30, 0x00,                      // GS v 0, mode=0
            (byteWidth and 0xFF).toByte(),                 // xL
            ((byteWidth shr 8) and 0xFF).toByte(),         // xH
            (height and 0xFF).toByte(),                    // yL
            ((height shr 8) and 0xFF).toByte()             // yH
        ))

        // Pack bits into bytes (MSB first — leftmost pixel is bit 7)
        for (y in 0 until height) {
            for (byteX in 0 until byteWidth) {
                var b = 0
                for (bit in 0 until 8) {
                    val x = byteX * 8 + bit
                    if (x < alignedWidth && mono[y * alignedWidth + x]) {
                        b = b or (0x80 shr bit)
                    }
                }
                baos.write(b)
            }
        }

        return baos.toByteArray()
    }
}
