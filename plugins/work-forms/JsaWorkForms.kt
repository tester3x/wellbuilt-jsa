package com.syconik801.jsaapp

import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.database.Cursor
import android.net.Uri
import android.os.*
import android.os.Process
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import org.json.JSONObject
import java.io.FileNotFoundException
import java.security.MessageDigest
import java.util.UUID

object JsaFormsMemory {
  private var revision=0L
  private var expires=0L
  private var payload:String?=null
  @Synchronized fun clear():Long { revision++;payload=null;expires=0;return revision }
  @Synchronized fun publish(expected:Long,until:Long,json:String):Boolean {
    if(expected!=revision||until<=System.currentTimeMillis()||until>System.currentTimeMillis()+120000||json.length>12000000)return false
    val p=JSONObject(json)
    if(p.optString("schema")!="wellbuilt.work-forms"||p.optInt("schemaVersion")!=1)return false
    payload=json;expires=until;return true
  }
  @Synchronized fun read(uri:Uri):ByteArray? {
    if(uri.authority!="com.syconik801.jsaapp.workforms"||uri.path!="/forms"||uri.queryParameterNames!=setOf("startDate","endDate"))return null
    if(System.currentTimeMillis()>expires){clear();return null}
    val json=payload?:return null
    val p=JSONObject(json)
    if(p.getString("startDate")!=uri.getQueryParameter("startDate")||p.getString("endDate")!=uri.getQueryParameter("endDate"))return null
    return json.toByteArray(Charsets.UTF_8)
  }
}
class JsaWorkFormsModule(context:ReactApplicationContext):ReactContextBaseJavaModule(context){
  override fun getName()="JsaWorkForms"
  @ReactMethod(isBlockingSynchronousMethod=true) fun clearWorkForms():Double=JsaFormsMemory.clear().toDouble()
  @ReactMethod(isBlockingSynchronousMethod=true) fun publishWorkForms(revision:Double,expires:Double,json:String):Boolean=JsaFormsMemory.publish(revision.toLong(),expires.toLong(),json)
}
class JsaWorkFormsPackage:ReactPackage {
  override fun createNativeModules(context:ReactApplicationContext):List<NativeModule> = listOf(JsaWorkFormsModule(context))
  override fun createViewManagers(context:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()
}
class JsaWorkFormsProvider:ContentProvider(){
  override fun onCreate()=true
  private fun authorize(){
    val app=context?:throw SecurityException("Caller unavailable")
    val packages=app.packageManager.getPackagesForUid(Binder.getCallingUid())?:throw SecurityException("Caller unavailable")
    require(Binder.getCallingUid()!=Process.myUid()&&packages.size==1&&packages[0]=="com.michaelburger.tickettime"){"Caller not authorized"}
    val pm=app.packageManager
    @Suppress("DEPRECATION")
    val signatures=if(Build.VERSION.SDK_INT>=28)pm.getPackageInfo(packages[0],PackageManager.GET_SIGNING_CERTIFICATES).signingInfo?.apkContentsSigners else pm.getPackageInfo(packages[0],PackageManager.GET_SIGNATURES).signatures
    require(!signatures.isNullOrEmpty()&&signatures.all{MessageDigest.getInstance("SHA-256").digest(it.toByteArray()).joinToString(""){b->"%02x".format(b)}=="f0e274f95acfbdb17ec024b9fa7c4ca50a0cc2c0568b8866a442b48ebb26d1ae"}){"Caller signer mismatch"}
  }
  override fun call(method:String,arg:String?,extras:Bundle?):Bundle {
    authorize();require(method=="prepareRefresh"&&arg==null&&extras?.keySet()==setOf("startDate","endDate"))
    val start=extras!!.getString("startDate")?:throw IllegalArgumentException("Missing start")
    val end=extras.getString("endDate")?:throw IllegalArgumentException("Missing end")
    require(Regex("\\d{4}-\\d{2}-\\d{2}").matches(start)&&Regex("\\d{4}-\\d{2}-\\d{2}").matches(end)&&start<=end)
    JsaFormsMemory.clear()
    val intent=Intent(context,JsaWorkFormsService::class.java).setData(Uri.parse("jsa-work-forms://refresh/"+UUID.randomUUID())).putExtra("startDate",start).putExtra("endDate",end)
    val flags=PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT
    val token=if(Build.VERSION.SDK_INT>=26)PendingIntent.getForegroundService(context,0,intent,flags)else PendingIntent.getService(context,0,intent,flags)
    return Bundle().apply{putParcelable("refreshIntent",token)}
  }
  override fun openFile(uri:Uri,mode:String):ParcelFileDescriptor{
    authorize();require(mode=="r")
    val bytes=JsaFormsMemory.read(uri)?:throw FileNotFoundException("Forms unavailable")
    val pipe=ParcelFileDescriptor.createPipe();Thread{try{ParcelFileDescriptor.AutoCloseOutputStream(pipe[1]).use{it.write(bytes)}}catch(_:java.io.IOException){}}.start();return pipe[0]
  }
  override fun query(uri:Uri,projection:Array<out String>?,selection:String?,selectionArgs:Array<out String>?,sortOrder:String?):Cursor? {authorize();throw UnsupportedOperationException("Use read stream")}
  override fun getType(uri:Uri):String?=null
  override fun insert(uri:Uri,values:ContentValues?):Uri?=throw UnsupportedOperationException("Read only")
  override fun delete(uri:Uri,selection:String?,selectionArgs:Array<out String>?):Int=throw UnsupportedOperationException("Read only")
  override fun update(uri:Uri,values:ContentValues?,selection:String?,selectionArgs:Array<out String>?):Int=throw UnsupportedOperationException("Read only")
}
class JsaWorkFormsService:HeadlessJsTaskService(){
  override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
    val manager=getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(NotificationChannel("jsa_forms","JSA reports",NotificationManager.IMPORTANCE_LOW))
    val builder=if(Build.VERSION.SDK_INT>=26)Notification.Builder(this,"jsa_forms")else Notification.Builder(this)
    val notification=builder.setSmallIcon(android.R.drawable.ic_menu_agenda).setContentTitle("WellBuilt JSA").setContentText("Preparing weekly forms for TicketTime").build()
    if(Build.VERSION.SDK_INT>=34)startForeground(7414,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE)else startForeground(7414,notification)
    val data=Arguments.createMap().apply{putString("startDate",intent?.getStringExtra("startDate"));putString("endDate",intent?.getStringExtra("endDate"))}
    startTask(HeadlessJsTaskConfig("JsaWorkFormsRefresh",data,60000,true));return START_NOT_STICKY
  }
  override fun onDestroy(){stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()}
}
