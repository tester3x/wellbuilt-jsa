package com.syconik801.jsaapp

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.brother.sdk.lmprinter.Channel
import com.brother.sdk.lmprinter.OpenChannelError
import com.brother.sdk.lmprinter.PrintError
import com.brother.sdk.lmprinter.PrinterDriver
import com.brother.sdk.lmprinter.PrinterDriverGenerator
import com.brother.sdk.lmprinter.PrinterModel
import com.brother.sdk.lmprinter.PrinterSearcher
import com.brother.sdk.lmprinter.setting.CustomPaperSize
import com.brother.sdk.lmprinter.setting.CustomPaperSize.Unit
import com.brother.sdk.lmprinter.setting.PrintImageSettings.ScaleMode
import com.brother.sdk.lmprinter.setting.RJPrintSettings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class BrotherPrinterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "BrotherPrinter"
        // Standard SPP (Serial Port Profile) UUID for Bluetooth Classic
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }

    override fun getName(): String = "BrotherPrinter"

    private fun getBluetoothAdapter(): BluetoothAdapter? {
        val manager = reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return manager?.adapter
    }

    /**
     * Check both BLUETOOTH_CONNECT and BLUETOOTH_SCAN permissions (Android 12+).
     * Returns a pair of (hasConnect, hasScan).
     */
    private fun checkBluetoothPermissions(): Pair<Boolean, Boolean> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return Pair(true, true)
        }
        val hasConnect = ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.BLUETOOTH_CONNECT
        ) == PackageManager.PERMISSION_GRANTED
        val hasScan = ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.BLUETOOTH_SCAN
        ) == PackageManager.PERMISSION_GRANTED
        return Pair(hasConnect, hasScan)
    }

    /**
     * Check bond state of a device and return diagnostic info.
     * Android 16 changed bond loss handling - bonds can go stale silently.
     */
    private fun getBondedDevice(adapter: BluetoothAdapter, macAddress: String): BluetoothDevice? {
        return try {
            adapter.bondedDevices?.find { it.address == macAddress }
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException checking bonded devices: ${e.message}")
            null
        }
    }

    /**
     * Connection strategy results for diagnostics.
     */
    data class ConnectionTestResult(
        val strategy: String,
        val success: Boolean,
        val error: String? = null
    )

    /**
     * Try ALL connection strategies and return results for each.
     * This tells us exactly which methods work on this device.
     *
     * Strategies (in order):
     * 1. Secure RFCOMM via SPP UUID (standard approach)
     * 2. Insecure RFCOMM via SPP UUID (skips encryption handshake - may work on Android 16)
     * 3. Reflection-based secure RFCOMM on port 1 (Samsung workaround)
     * 4. Reflection-based insecure RFCOMM on port 1 (Samsung + Android 16)
     */
    private fun testAllRfcommStrategies(device: BluetoothDevice): List<ConnectionTestResult> {
        val results = mutableListOf<ConnectionTestResult>()

        // Strategy 1: Standard secure RFCOMM
        var socket: BluetoothSocket? = null
        try {
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            socket.connect()
            results.add(ConnectionTestResult("secure_spp", true))
            Log.i(TAG, "Strategy 1 (secure SPP) SUCCESS")
        } catch (e: Exception) {
            results.add(ConnectionTestResult("secure_spp", false, e.message))
            Log.e(TAG, "Strategy 1 (secure SPP) FAILED: ${e.message}")
        } finally {
            try { socket?.close() } catch (_: Exception) {}
        }
        Thread.sleep(500) // Let BT stack reset between tests

        // Strategy 2: Insecure RFCOMM (no encryption handshake)
        socket = null
        try {
            socket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID)
            socket.connect()
            results.add(ConnectionTestResult("insecure_spp", true))
            Log.i(TAG, "Strategy 2 (insecure SPP) SUCCESS")
        } catch (e: Exception) {
            results.add(ConnectionTestResult("insecure_spp", false, e.message))
            Log.e(TAG, "Strategy 2 (insecure SPP) FAILED: ${e.message}")
        } finally {
            try { socket?.close() } catch (_: Exception) {}
        }
        Thread.sleep(500)

        // Strategy 3: Reflection-based secure RFCOMM on port 1
        socket = null
        try {
            val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
            socket = method.invoke(device, 1) as BluetoothSocket
            socket.connect()
            results.add(ConnectionTestResult("secure_port1", true))
            Log.i(TAG, "Strategy 3 (secure port 1) SUCCESS")
        } catch (e: Exception) {
            results.add(ConnectionTestResult("secure_port1", false, e.message))
            Log.e(TAG, "Strategy 3 (secure port 1) FAILED: ${e.message}")
        } finally {
            try { socket?.close() } catch (_: Exception) {}
        }
        Thread.sleep(500)

        // Strategy 4: Reflection-based insecure RFCOMM on port 1
        socket = null
        try {
            val method = device.javaClass.getMethod("createInsecureRfcommSocket", Int::class.javaPrimitiveType)
            socket = method.invoke(device, 1) as BluetoothSocket
            socket.connect()
            results.add(ConnectionTestResult("insecure_port1", true))
            Log.i(TAG, "Strategy 4 (insecure port 1) SUCCESS")
        } catch (e: Exception) {
            results.add(ConnectionTestResult("insecure_port1", false, e.message))
            Log.e(TAG, "Strategy 4 (insecure port 1) FAILED: ${e.message}")
        } finally {
            try { socket?.close() } catch (_: Exception) {}
        }

        return results
    }

    /**
     * Opens a Bluetooth channel to the printer with retry logic.
     * On failure, tests all RFCOMM strategies to diagnose the issue.
     */
    private fun connectWithRetry(
        macAddress: String,
        adapter: BluetoothAdapter,
        maxAttempts: Int = 1
    ): Triple<PrinterDriver?, OpenChannelError.ErrorCode, String> {
        var driver: PrinterDriver? = null
        var lastError = OpenChannelError.ErrorCode.NoError
        val diagnostics = StringBuilder()

        // Cancel any ongoing discovery - it severely interferes with connections
        try { adapter.cancelDiscovery() } catch (_: Exception) {}

        // Small delay after canceling discovery to let BT stack settle
        Thread.sleep(500)

        for (attempt in 1..maxAttempts) {
            Log.i(TAG, "Connection attempt $attempt/$maxAttempts to $macAddress")
            diagnostics.append("Attempt $attempt: ")

            val channel = Channel.newBluetoothChannel(macAddress, adapter)
            val result = PrinterDriverGenerator.openChannel(channel)

            if (result.error.code == OpenChannelError.ErrorCode.NoError) {
                driver = result.driver
                diagnostics.append("SUCCESS\n")
                Log.i(TAG, "Brother SDK connection SUCCESS on attempt $attempt")
                break
            }

            lastError = result.error.code
            diagnostics.append("${result.error.code}\n")
            Log.w(TAG, "Brother SDK attempt $attempt failed: ${result.error.code}")

            // Try to clean up any partially opened channel
            try { result.driver?.closeChannel() } catch (_: Exception) {}

            if (attempt < maxAttempts) {
                // Increase delay between retries - BT stack needs time
                Thread.sleep(2000L + (attempt * 500L))
            }
        }

        // Printing fails after one SDK attempt. Raw Bluetooth diagnostics must
        // not add four more blocking connection probes to a user's print job.

        return Triple(driver, lastError, diagnostics.toString())
    }

    /**
     * Build a detailed error message based on the failure mode.
     * Provides actionable guidance based on which strategies worked/failed.
     */
    private fun buildErrorMessage(
        errorCode: OpenChannelError.ErrorCode,
        diagnostics: String,
        macAddress: String
    ): String {
        val base = "Connection failed ($errorCode)."

        // Check which strategies succeeded
        val anyRfcommWorked = diagnostics.contains(": SUCCESS")
        val insecureSppWorked = diagnostics.contains("insecure_spp: SUCCESS")
        val insecurePort1Worked = diagnostics.contains("insecure_port1: SUCCESS")
        val secureSppWorked = diagnostics.contains("secure_spp: SUCCESS")
        val securePort1Worked = diagnostics.contains("secure_port1: SUCCESS")
        val allFailed = !anyRfcommWorked && diagnostics.contains(": FAILED")

        return when {
            insecureSppWorked || insecurePort1Worked -> {
                // Insecure works but secure doesn't = encryption/bond key issue
                "$base Insecure Bluetooth works but secure connection fails. " +
                "This is an Android 16 encryption handshake issue. " +
                "The Brother SDK uses secure RFCOMM internally. " +
                "Try: 1) Unpair printer, 2) Restart printer, 3) Re-pair, 4) Try again. " +
                "If it keeps failing, the Brother SDK may need an update for Android 16. " +
                "Diagnostics:\n$diagnostics"
            }
            secureSppWorked || securePort1Worked -> {
                // Raw BT works but Brother SDK doesn't = SDK issue
                "$base Bluetooth connection works but the Brother print SDK failed. " +
                "The Brother SDK (AAR) may need to be updated for Android ${Build.VERSION.SDK_INT}. " +
                "Diagnostics:\n$diagnostics"
            }
            allFailed -> {
                // Nothing works at all
                "$base Cannot connect to printer at all. " +
                "All 4 Bluetooth connection strategies failed.\n\n" +
                "Please try:\n" +
                "1. Go to Settings > Bluetooth\n" +
                "2. Tap the printer > Unpair\n" +
                "3. Turn printer OFF, wait 10 seconds, turn ON\n" +
                "4. Pair again from Bluetooth settings\n" +
                "5. Try printing again\n\n" +
                "If this keeps happening, check the printer's Bluetooth mode " +
                "is set to 'Classic' (not 'LE' only).\n\n" +
                "Diagnostics:\n$diagnostics"
            }
            else -> {
                "$base Make sure the printer is ON and nearby. " +
                "If the problem persists, try unpairing and re-pairing the printer. " +
                "Diagnostics:\n$diagnostics"
            }
        }
    }

    /**
     * Returns all bonded (paired) Bluetooth devices.
     * The JS side shows these in a picker so the user can select the printer.
     * No Brother SDK search needed — just reads the OS bond list.
     */
    @ReactMethod
    fun getBondedDevices(promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val (hasConnect, _) = checkBluetoothPermissions()
                if (!hasConnect) {
                    withContext(Dispatchers.Main) {
                        promise.reject("PERMISSION_ERROR", "BLUETOOTH_CONNECT permission not granted.")
                    }
                    return@launch
                }

                val adapter = getBluetoothAdapter()
                if (adapter == null || !adapter.isEnabled) {
                    withContext(Dispatchers.Main) {
                        promise.reject("BT_ERROR",
                            if (adapter == null) "Bluetooth adapter not available"
                            else "Bluetooth is turned off. Please enable Bluetooth.")
                    }
                    return@launch
                }

                val devices = Arguments.createArray()
                try {
                    adapter.bondedDevices?.forEach { device ->
                        val d = Arguments.createMap()
                        d.putString("name", device.name ?: "Unknown")
                        d.putString("macAddress", device.address)
                        d.putInt("type", device.type)
                        d.putString("typeStr", when (device.type) {
                            BluetoothDevice.DEVICE_TYPE_CLASSIC -> "Classic"
                            BluetoothDevice.DEVICE_TYPE_LE -> "LE"
                            BluetoothDevice.DEVICE_TYPE_DUAL -> "Dual"
                            else -> "Unknown"
                        })
                        // Flag likely printers for the UI
                        val name = device.name ?: ""
                        d.putBoolean("isPrinter",
                            name.contains("Brother", ignoreCase = true) ||
                            name.contains("RJ-", ignoreCase = true) ||
                            name.contains("RJ4", ignoreCase = true) ||
                            name.contains("QL-", ignoreCase = true) ||
                            name.contains("TD-", ignoreCase = true) ||
                            name.contains("PT-", ignoreCase = true) ||
                            name.contains("PJ-", ignoreCase = true))
                        devices.pushMap(d)
                    }
                } catch (e: SecurityException) {
                    Log.e(TAG, "SecurityException listing bonded devices: ${e.message}")
                }

                Log.i(TAG, "getBondedDevices: found ${devices.size()} device(s)")
                withContext(Dispatchers.Main) {
                    promise.resolve(devices)
                }
            } catch (e: Exception) {
                Log.e(TAG, "getBondedDevices exception: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    promise.reject("BT_ERROR", e.message, e)
                }
            }
        }
    }

    @ReactMethod
    fun searchPrinters(promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val (hasConnect, hasScan) = checkBluetoothPermissions()

                if (!hasConnect || !hasScan) {
                    val missing = mutableListOf<String>()
                    if (!hasConnect) missing.add("BLUETOOTH_CONNECT")
                    if (!hasScan) missing.add("BLUETOOTH_SCAN")
                    withContext(Dispatchers.Main) {
                        promise.reject(
                            "PERMISSION_ERROR",
                            "Missing Bluetooth permissions: ${missing.joinToString(", ")}. " +
                            "Please allow Bluetooth access in app settings."
                        )
                    }
                    return@launch
                }

                val adapter = getBluetoothAdapter()
                if (adapter == null) {
                    withContext(Dispatchers.Main) {
                        promise.reject("BT_ERROR", "Bluetooth adapter not available. Is Bluetooth enabled?")
                    }
                    return@launch
                }

                if (!adapter.isEnabled) {
                    withContext(Dispatchers.Main) {
                        promise.reject("BT_ERROR", "Bluetooth is turned off. Please enable Bluetooth.")
                    }
                    return@launch
                }

                // Cancel discovery before searching to avoid interference
                try { adapter.cancelDiscovery() } catch (_: Exception) {}

                Log.i(TAG, "Starting Brother Bluetooth search (10s timeout)...")

                // Wrap Brother SDK search in a timeout — it can hang indefinitely
                val executor = Executors.newSingleThreadExecutor()
                val searchFuture = executor.submit(Callable {
                    PrinterSearcher.startBluetoothSearch(reactApplicationContext)
                })
                val result = try {
                    searchFuture.get(10, TimeUnit.SECONDS)
                } catch (e: Exception) {
                    Log.e(TAG, "Brother search timed out or failed: ${e.message}")
                    searchFuture.cancel(true)
                    null
                } finally {
                    executor.shutdown()
                }

                if (result == null || result.error.code != com.brother.sdk.lmprinter.PrinterSearchError.ErrorCode.NoError) {
                    Log.e(TAG, "Brother search failed: ${result?.error?.code ?: "TIMEOUT"}")

                    // Fallback: manually list bonded Brother devices
                    val fallbackPrinters = Arguments.createArray()
                    try {
                        adapter.bondedDevices?.forEach { device ->
                            val name = device.name ?: ""
                            if (name.contains("Brother", ignoreCase = true) ||
                                name.contains("RJ-", ignoreCase = true) ||
                                name.contains("RJ4", ignoreCase = true)) {
                                val printer = Arguments.createMap()
                                printer.putString("modelName", name)
                                printer.putString("macAddress", device.address)
                                printer.putString("source", "bonded_fallback")
                                fallbackPrinters.pushMap(printer)
                                Log.i(TAG, "Found bonded Brother device: $name (${device.address})")
                            }
                        }
                    } catch (e: SecurityException) {
                        Log.e(TAG, "SecurityException listing bonded devices: ${e.message}")
                    }

                    if (fallbackPrinters.size() > 0) {
                        Log.i(TAG, "Brother search failed but found ${fallbackPrinters.size()} bonded Brother device(s)")
                        withContext(Dispatchers.Main) {
                            promise.resolve(fallbackPrinters)
                        }
                    } else {
                        withContext(Dispatchers.Main) {
                            promise.reject("SEARCH_ERROR",
                                "Bluetooth search failed (${result?.error?.code ?: "TIMEOUT"}). " +
                                "No paired Brother printers found. " +
                                "Make sure the printer is paired in Android Bluetooth settings.")
                        }
                    }
                    return@launch
                }

                val printers = Arguments.createArray()
                for (channel in result.channels) {
                    val printer = Arguments.createMap()
                    val modelName = channel.extraInfo?.get(Channel.ExtraInfoKey.ModelName) ?: "Unknown"
                    printer.putString("modelName", modelName)
                    printer.putString("macAddress", channel.channelInfo)
                    printer.putString("source", "brother_search")
                    printers.pushMap(printer)
                    Log.i(TAG, "Brother search found: $modelName (${channel.channelInfo})")
                }

                // If Brother search returned nothing, also check bonded devices as fallback
                if (printers.size() == 0) {
                    try {
                        adapter.bondedDevices?.forEach { device ->
                            val name = device.name ?: ""
                            if (name.contains("Brother", ignoreCase = true) ||
                                name.contains("RJ-", ignoreCase = true) ||
                                name.contains("RJ4", ignoreCase = true)) {
                                val printer = Arguments.createMap()
                                printer.putString("modelName", name)
                                printer.putString("macAddress", device.address)
                                printer.putString("source", "bonded_fallback")
                                printers.pushMap(printer)
                                Log.i(TAG, "Fallback: bonded Brother device: $name (${device.address})")
                            }
                        }
                    } catch (e: SecurityException) {
                        Log.e(TAG, "SecurityException in fallback: ${e.message}")
                    }
                }

                Log.i(TAG, "Search complete, found ${printers.size()} printer(s)")
                withContext(Dispatchers.Main) {
                    promise.resolve(printers)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Search exception: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    promise.reject("SEARCH_ERROR", e.message, e)
                }
            }
        }
    }

    /**
     * Diagnostic method: Check Bluetooth state and permissions.
     * Call this from JS to get detailed info about what might be wrong.
     */
    @ReactMethod
    fun getDiagnostics(macAddress: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val info = Arguments.createMap()
                info.putInt("androidVersion", Build.VERSION.SDK_INT)
                info.putString("androidRelease", Build.VERSION.RELEASE)
                info.putString("manufacturer", Build.MANUFACTURER)
                info.putString("model", Build.MODEL)

                val (hasConnect, hasScan) = checkBluetoothPermissions()
                info.putBoolean("hasBluetoothConnect", hasConnect)
                info.putBoolean("hasBluetoothScan", hasScan)

                val adapter = getBluetoothAdapter()
                info.putBoolean("hasAdapter", adapter != null)
                info.putBoolean("isEnabled", adapter?.isEnabled ?: false)

                if (adapter != null && macAddress.isNotEmpty()) {
                    val device = getBondedDevice(adapter, macAddress)
                    info.putBoolean("isPaired", device != null)
                    if (device != null) {
                        info.putInt("bondState", device.bondState)
                        info.putString("bondStateStr", when (device.bondState) {
                            BluetoothDevice.BOND_BONDED -> "BONDED"
                            BluetoothDevice.BOND_BONDING -> "BONDING"
                            BluetoothDevice.BOND_NONE -> "NONE"
                            else -> "UNKNOWN(${device.bondState})"
                        })
                        try {
                            info.putString("deviceName", device.name ?: "null")
                            info.putInt("deviceType", device.type)
                            info.putString("deviceTypeStr", when (device.type) {
                                BluetoothDevice.DEVICE_TYPE_CLASSIC -> "CLASSIC"
                                BluetoothDevice.DEVICE_TYPE_LE -> "LE"
                                BluetoothDevice.DEVICE_TYPE_DUAL -> "DUAL"
                                BluetoothDevice.DEVICE_TYPE_UNKNOWN -> "UNKNOWN"
                                else -> "OTHER(${device.type})"
                            })
                        } catch (e: SecurityException) {
                            info.putString("deviceName", "SecurityException")
                        }

                        // Test all RFCOMM strategies
                        try {
                            adapter.cancelDiscovery()
                        } catch (_: Exception) {}
                        Thread.sleep(300)

                        val strategyResults = testAllRfcommStrategies(device)
                        val strategiesMap = Arguments.createMap()
                        for (r in strategyResults) {
                            strategiesMap.putBoolean(r.strategy, r.success)
                            if (!r.success && r.error != null) {
                                strategiesMap.putString("${r.strategy}_error", r.error)
                            }
                        }
                        info.putMap("rfcommStrategies", strategiesMap)

                        // Backward compat fields
                        val secureWorks = strategyResults.any { it.strategy == "secure_spp" && it.success }
                        val insecureWorks = strategyResults.any { (it.strategy == "insecure_spp" || it.strategy == "insecure_port1") && it.success }
                        info.putBoolean("rawRfcommWorks", secureWorks)
                        info.putBoolean("insecureRfcommWorks", insecureWorks)
                        info.putBoolean("anyRfcommWorks", strategyResults.any { it.success })
                        if (!secureWorks) {
                            val fallbackWorks = strategyResults.any { it.strategy == "secure_port1" && it.success }
                            info.putBoolean("fallbackRfcommWorks", fallbackWorks)
                        }
                    }

                    // List all bonded devices
                    val bonded = Arguments.createArray()
                    try {
                        adapter.bondedDevices?.forEach { d ->
                            val dMap = Arguments.createMap()
                            dMap.putString("name", d.name ?: "null")
                            dMap.putString("address", d.address)
                            dMap.putInt("type", d.type)
                            bonded.pushMap(dMap)
                        }
                    } catch (e: SecurityException) {
                        Log.e(TAG, "SecurityException listing bonded: ${e.message}")
                    }
                    info.putArray("bondedDevices", bonded)
                }

                withContext(Dispatchers.Main) {
                    promise.resolve(info)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("DIAG_ERROR", e.message, e)
                }
            }
        }
    }

    @ReactMethod
    fun printImage(macAddress: String, imagePath: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val (hasConnect, hasScan) = checkBluetoothPermissions()
                if (!hasConnect) {
                    withContext(Dispatchers.Main) {
                        promise.reject("PERMISSION_ERROR",
                            "BLUETOOTH_CONNECT permission not granted. Please allow in app settings.")
                    }
                    return@launch
                }

                val adapter = getBluetoothAdapter()
                if (adapter == null || !adapter.isEnabled) {
                    withContext(Dispatchers.Main) {
                        promise.reject("BT_ERROR",
                            if (adapter == null) "Bluetooth adapter not available"
                            else "Bluetooth is turned off. Please enable Bluetooth.")
                    }
                    return@launch
                }

                // Verify the printer is bonded/paired
                val device = getBondedDevice(adapter, macAddress)
                if (device == null) {
                    withContext(Dispatchers.Main) {
                        promise.reject("CONNECT_ERROR",
                            "Printer ($macAddress) is not paired. " +
                            "Please pair the printer in Android Bluetooth settings first.")
                    }
                    return@launch
                }

                // Check bond state
                if (device.bondState != BluetoothDevice.BOND_BONDED) {
                    withContext(Dispatchers.Main) {
                        promise.reject("CONNECT_ERROR",
                            "Printer bond state is ${device.bondState} (expected BONDED). " +
                            "Please unpair and re-pair the printer in Bluetooth settings.")
                    }
                    return@launch
                }

                Log.i(TAG, "printImage: device=${device.name}, bond=${device.bondState}, type=${device.type}")

                // Connect with retry (cancels discovery automatically)
                val (driver, lastError, diagnostics) = connectWithRetry(macAddress, adapter)

                if (driver == null) {
                    withContext(Dispatchers.Main) {
                        promise.reject("CONNECT_ERROR",
                            buildErrorMessage(lastError, diagnostics, macAddress))
                    }
                    return@launch
                }

                try {
                    val settings = RJPrintSettings(PrinterModel.RJ_4230B)
                    settings.workPath = reactApplicationContext.filesDir.absolutePath
                    settings.numCopies = 1

                    // Configure 4-inch roll paper — without this, printer defaults to ~2" width
                    val margins = CustomPaperSize.Margins(0f, 0f, 0f, 0f)
                    val rollPaper = CustomPaperSize.newRollPaperSize(4f, margins, Unit.Inch, 0)
                    settings.customPaperSize = rollPaper

                    // Scale image to fit the full paper width (maintain aspect ratio)
                    settings.scaleMode = ScaleMode.FitPageAspect

                    // Clean up the file path (remove file:// prefix if present)
                    val cleanPath = imagePath.replace("file://", "")
                    Log.i(TAG, "Printing image: $cleanPath")
                    val printError = driver.printImage(cleanPath, settings)

                    withContext(Dispatchers.Main) {
                        if (printError.code == PrintError.ErrorCode.NoError) {
                            promise.resolve("Print successful")
                        } else {
                            promise.reject("PRINT_ERROR", "Print failed: ${printError.code}")
                        }
                    }
                } finally {
                    driver.closeChannel()
                }
            } catch (e: Exception) {
                Log.e(TAG, "printImage exception: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    promise.reject("PRINT_ERROR", e.message, e)
                }
            }
        }
    }

    /**
     * Render the first page of a PDF to a PNG image at the printer's native 203 DPI.
     * This offloads PDF rendering from the Brother SDK (which has issues on Android)
     * to Android's built-in PdfRenderer, which is fast and reliable.
     * Returns the absolute path to the temp PNG, or null on failure.
     */
    @ReactMethod
    fun getPDFPageCount(pdfPath: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val file = File(pdfPath.removePrefix("file://"))
                val count = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                    PdfRenderer(fd).use { renderer -> renderer.pageCount }
                }
                withContext(Dispatchers.Main) { promise.resolve(count) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { promise.reject("PDF_ERROR", "Could not read the PDF page count", e) }
            }
        }
    }

    private fun renderPdfToImage(pdfPath: String, pageIndex: Int): String? {
        val file = File(pdfPath)
        if (!file.exists()) {
            Log.e(TAG, "renderPdfToImage: PDF file not found: $pdfPath")
            return null
        }

        var fd: ParcelFileDescriptor? = null
        var renderer: PdfRenderer? = null
        var bitmap: Bitmap? = null
        try {
            fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
            renderer = PdfRenderer(fd)

            if (renderer.pageCount == 0) {
                Log.e(TAG, "renderPdfToImage: PDF has 0 pages")
                return null
            }

            val page = renderer.openPage(pageIndex)

            // Render at 203 DPI (RJ-4230B native resolution)
            // PDF page dimensions are in 1/72 inch points
            val scale = 203f / 72f  // ≈ 2.819
            val bitmapWidth = (page.width * scale).toInt()
            val bitmapHeight = (page.height * scale).toInt()

            Log.i(TAG, "renderPdfToImage: PDF page ${page.width}x${page.height}pt → bitmap ${bitmapWidth}x${bitmapHeight}px @ 203 DPI")

            bitmap = Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888)

            // Fill with white — PdfRenderer leaves transparent background by default
            val canvas = Canvas(bitmap)
            canvas.drawColor(Color.WHITE)

            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
            page.close()
            renderer.close()
            renderer = null
            fd.close()
            fd = null

            // Trim trailing whitespace from bottom of bitmap to prevent extra paper feed
            val originalHeight = bitmap.height
            val trimmed = trimBottomWhitespace(bitmap, 40)
            if (trimmed !== bitmap) {
                bitmap.recycle()
                bitmap = trimmed
            }
            Log.i(TAG, "renderPdfToImage: trimmed ${originalHeight}px → ${bitmap!!.height}px")

            // Save as PNG to cache dir
            val tempFile = File(reactApplicationContext.cacheDir, "print_render_${System.currentTimeMillis()}.png")
            FileOutputStream(tempFile).use { out ->
                bitmap!!.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
            Log.i(TAG, "renderPdfToImage: saved ${tempFile.length()} bytes to ${tempFile.absolutePath}")

            return tempFile.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "renderPdfToImage: exception: ${e.message}", e)
            return null
        } finally {
            bitmap?.recycle()
            try { renderer?.close() } catch (_: Exception) {}
            try { fd?.close() } catch (_: Exception) {}
        }
    }

    /**
     * Scan a bitmap from the bottom up and crop trailing whitespace.
     * Returns a new (smaller) bitmap if whitespace was found, or the
     * original bitmap if there's nothing significant to trim.
     * @param paddingPx Extra rows to keep below the last content row.
     */
    private fun trimBottomWhitespace(src: Bitmap, paddingPx: Int = 40): Bitmap {
        val width = src.width
        val height = src.height
        val rowPixels = IntArray(width)
        var lastContentRow = 0

        // Scan from bottom up — find first row with non-white pixels
        for (y in (height - 1) downTo 0) {
            src.getPixels(rowPixels, 0, width, 0, y, width, 1)
            var hasContent = false
            // Sample every 4th pixel for speed (anti-aliased edges still caught)
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

        // Not worth trimming if less than 50px saved
        if (height - trimmedHeight < 50) return src

        return Bitmap.createBitmap(src, 0, 0, width, trimmedHeight)
    }

    @ReactMethod
    fun printPDF(macAddress: String, pdfPath: String, paperWidth: Double, pageIndex: Int, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            var currentPage = 0
            var totalPages = 0
            var sendingPage = false
            try {
                val (hasConnect, hasScan) = checkBluetoothPermissions()
                if (!hasConnect) {
                    withContext(Dispatchers.Main) {
                        promise.reject("PERMISSION_ERROR",
                            "BLUETOOTH_CONNECT permission not granted. Please allow in app settings.")
                    }
                    return@launch
                }

                val adapter = getBluetoothAdapter()
                if (adapter == null || !adapter.isEnabled) {
                    withContext(Dispatchers.Main) {
                        promise.reject("BT_ERROR",
                            if (adapter == null) "Bluetooth adapter not available"
                            else "Bluetooth is turned off. Please enable Bluetooth.")
                    }
                    return@launch
                }

                // Verify the printer is bonded/paired
                val device = getBondedDevice(adapter, macAddress)
                if (device == null) {
                    withContext(Dispatchers.Main) {
                        promise.reject("CONNECT_ERROR",
                            "Printer ($macAddress) is not paired. " +
                            "Please pair the printer in Android Bluetooth settings first.")
                    }
                    return@launch
                }

                // Check bond state
                if (device.bondState != BluetoothDevice.BOND_BONDED) {
                    withContext(Dispatchers.Main) {
                        promise.reject("CONNECT_ERROR",
                            "Printer bond state is ${device.bondState} (expected BONDED). " +
                            "Please unpair and re-pair the printer in Bluetooth settings.")
                    }
                    return@launch
                }

                Log.i(TAG, "printPDF: device=${device.name}, bond=${device.bondState}, type=${device.type}")

                // Render the PDF to a PNG image BEFORE connecting to the printer.
                // Android's PdfRenderer is fast and reliable. The Brother SDK v4.7.3's
                // internal PDF renderer chokes on complex PDFs (flexbox HTML, embedded
                // base64 images). By rendering on the phone and sending a simple bitmap,
                // we bypass the SDK's PDF rendering entirely.
                val cleanPath = pdfPath.replace("file://", "")
                totalPages = ParcelFileDescriptor.open(File(cleanPath), ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                    PdfRenderer(descriptor).use { renderer -> renderer.pageCount }
                }
                // -1 is one continuous report job. Keep the channel open across
                // pages; WB-E has no ticket-copy tear-off delay.
                val firstPage = if (pageIndex == -1) 0 else pageIndex
                val lastPage = if (pageIndex == -1) totalPages - 1 else pageIndex
                require(firstPage >= 0 && lastPage < totalPages) { "Invalid PDF page" }
                currentPage = firstPage
                Log.i(TAG, "printPDF: rendering PDF to image: $cleanPath")
                val imagePath = renderPdfToImage(cleanPath, firstPage)
                if (imagePath == null) {
                    withContext(Dispatchers.Main) {
                        promise.reject("PRINT_ERROR", "Failed to render PDF to image. The PDF file may be empty or corrupted.")
                    }
                    return@launch
                }

                // Connect with retry (cancels discovery automatically)
                val (driver, lastError, diagnostics) = connectWithRetry(macAddress, adapter)

                if (driver == null) {
                    try { File(imagePath).delete() } catch (_: Exception) {}
                    withContext(Dispatchers.Main) {
                        promise.reject("CONNECT_ERROR",
                            buildErrorMessage(lastError, diagnostics, macAddress))
                    }
                    return@launch
                }

                try {
                    val settings = RJPrintSettings(PrinterModel.RJ_4230B)
                    settings.workPath = reactApplicationContext.filesDir.absolutePath
                    settings.numCopies = 1

                    // Dynamic roll paper width — passed from JS (default 4")
                    val pw = if (paperWidth > 0) paperWidth.toFloat() else 4f
                    val margins = CustomPaperSize.Margins(0f, 0f, 0f, 0f)
                    val rollPaper = CustomPaperSize.newRollPaperSize(pw, margins, Unit.Inch, 0)
                    settings.customPaperSize = rollPaper

                    // Scale image to fit the full paper width (maintain aspect ratio)
                    settings.scaleMode = ScaleMode.FitPageAspect

                    for (page in firstPage..lastPage) {
                        currentPage = page
                        sendingPage = false
                        val nextImage = if (page == firstPage) imagePath else renderPdfToImage(cleanPath, page)
                        if (nextImage == null) throw IllegalStateException("Failed to render PDF page")
                        try {
                            Log.i(TAG, "printPDF: sending page ${page + 1}/$totalPages on the existing channel")
                            sendingPage = true
                            val printError = driver.printImage(nextImage, settings)
                            if (printError.code != PrintError.ErrorCode.NoError) {
                                throw IllegalStateException("Print failed: ${printError.code}")
                            }
                            sendingPage = false
                        } finally {
                            try { File(nextImage).delete() } catch (_: Exception) {}
                        }
                    }
                    withContext(Dispatchers.Main) { promise.resolve("Print successful") }
                } finally {
                    driver.closeChannel()
                }
            } catch (e: Exception) {
                Log.e(TAG, "printPDF exception: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    val prior = if (currentPage > 0) "Earlier pages may have printed. " else ""
                    val partial = if (sendingPage) "Part of this page may have printed. " else ""
                    promise.reject("PRINT_ERROR", "Stopped on page ${currentPage + 1} of $totalPages. $prior$partial${e.message}", e)
                }
            }
        }
    }
}
