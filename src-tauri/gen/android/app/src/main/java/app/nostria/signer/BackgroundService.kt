package app.nostria.signer

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager

class BackgroundService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "NostriaSigner::BackgroundServiceWakeLock"
        )
        wakeLock?.acquire()
    }

    override fun onDestroy() {
        wakeLock?.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
}
