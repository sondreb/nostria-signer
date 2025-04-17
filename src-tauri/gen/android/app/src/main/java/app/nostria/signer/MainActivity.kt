package app.nostria.signer

import android.content.Intent
import android.os.Bundle
import com.tauri.android.TauriActivity

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startBackgroundService()
    }

    private fun startBackgroundService() {
        val serviceIntent = Intent(this, BackgroundService::class.java)
        startService(serviceIntent)
    }

    override fun onDestroy() {
        val serviceIntent = Intent(this, BackgroundService::class.java)
        stopService(serviceIntent)
        super.onDestroy()
    }
}