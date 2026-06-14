package com.robokorda.stockmindmobile

import android.Manifest
import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.util.concurrent.atomic.AtomicInteger

class MainActivity : FlutterActivity() {
  companion object {
    private const val FILE_CHANNEL = "stockmind/files"
    private const val NOTIFICATION_CHANNEL_ID = "stockmind_downloads"
    private const val NOTIFICATION_CHANNEL_NAME = "StockMind Downloads"
    private const val NOTIFICATION_PERMISSION_REQUEST_CODE = 7031
  }

  private var pendingNotificationFileName: String? = null
  private val notificationIdCounter = AtomicInteger(3000)

  override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)

    MethodChannel(flutterEngine.dartExecutor.binaryMessenger, FILE_CHANNEL)
      .setMethodCallHandler { call, result ->
        when (call.method) {
          "saveCsvToDownloads" -> {
            val filename = call.argument<String>("filename")
            val content = call.argument<String>("content")

            if (filename.isNullOrBlank() || content == null) {
              result.error("INVALID_ARGS", "filename and content are required", null)
              return@setMethodCallHandler
            }

            try {
              val savedAt = saveCsvToDownloads(filename.trim(), content)
              notifyDownloadCompleted(filename.trim())
              result.success(savedAt)
            } catch (error: Exception) {
              result.error("SAVE_FAILED", error.message, null)
            }
          }

          else -> result.notImplemented()
        }
      }
  }

  private fun saveCsvToDownloads(filename: String, content: String): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val resolver = applicationContext.contentResolver
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
        put(MediaStore.MediaColumns.MIME_TYPE, "text/csv")
        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
      }

      val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("Unable to create file in Downloads.")

      resolver.openOutputStream(uri)?.use { stream ->
        stream.write(content.toByteArray(Charsets.UTF_8))
        stream.flush()
      } ?: throw IllegalStateException("Unable to open output stream.")

      return "Downloads/$filename"
    }

    val downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    if (!downloadDir.exists()) {
      downloadDir.mkdirs()
    }

    val file = File(downloadDir, filename)
    file.writeText(content, Charsets.UTF_8)
    return file.absolutePath
  }

  private fun notifyDownloadCompleted(filename: String) {
    ensureNotificationChannel()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(
        this,
        Manifest.permission.POST_NOTIFICATIONS,
      ) != PackageManager.PERMISSION_GRANTED
    ) {
      pendingNotificationFileName = filename
      requestPermissions(
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        NOTIFICATION_PERMISSION_REQUEST_CODE,
      )
      return
    }

    val intent = Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
    }
    val pendingIntentFlags =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }

    val pendingIntent =
      PendingIntent.getActivity(
        this,
        notificationIdCounter.incrementAndGet(),
        intent,
        pendingIntentFlags,
      )

    val notification =
      NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
        .setSmallIcon(android.R.drawable.stat_sys_download_done)
        .setContentTitle("CSV downloaded")
        .setContentText("$filename saved to Downloads")
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setContentIntent(pendingIntent)
        .build()

    NotificationManagerCompat.from(this)
      .notify(notificationIdCounter.incrementAndGet(), notification)
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val existing = manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID)
    if (existing != null) {
      return
    }

    val channel =
      NotificationChannel(
        NOTIFICATION_CHANNEL_ID,
        NOTIFICATION_CHANNEL_NAME,
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = "Notifications for downloaded CSV reports"
      }
    manager.createNotificationChannel(channel)
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != NOTIFICATION_PERMISSION_REQUEST_CODE) {
      return
    }

    val filename = pendingNotificationFileName
    pendingNotificationFileName = null
    if (filename.isNullOrBlank()) {
      return
    }
    if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
      notifyDownloadCompleted(filename)
    }
  }
}
