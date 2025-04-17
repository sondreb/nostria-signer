// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use keyring::Entry;
use serde::Serialize;

#[derive(Serialize)]
struct KeyResponse {
    success: bool,
    message: String,
    public_key: Option<String>,  // Optional field for public key
    private_key: Option<String>, // Optional field for private key
}

#[tauri::command]
fn save_private_key(public_key: &str, private_key: &str) -> KeyResponse {
    // Define service and username for the keyring entry
    let service = "nostria-signer";
    let username = format!("{}-{}", service, public_key); // Fixed string concatenation

    // Create a keyring entry
    let entry = match Entry::new(service, &username) {
        Ok(entry) => entry,
        Err(err) => {
            return KeyResponse {
                success: false,
                message: format!("Failed to create keyring entry: {}", err),
                public_key: Some(public_key.to_string()),
                private_key: None,
            }
        }
    };

    // Store the private key
    match entry.set_password(private_key) {
        Ok(_) => KeyResponse {
            success: true,
            message: format!("Private key for {} successfully stored", public_key),
            public_key: Some(public_key.to_string()),
            private_key: None,
        },
        Err(err) => KeyResponse {
            success: false,
            message: format!("Failed to store private key: {}", err),
            public_key: Some(public_key.to_string()),
            private_key: None,
        },
    }
}

#[tauri::command]
fn get_private_key(public_key: &str) -> KeyResponse {
    // Define service and username for the keyring entry
    let service = "nostria-signer";
    let username = format!("{}-{}", service, public_key); // Fixed string concatenation

    // Create a keyring entry
    let entry = match Entry::new(service, &username) {
        Ok(entry) => entry,
        Err(err) => {
            return KeyResponse {
                success: false,
                message: format!("Failed to create keyring entry: {}", err),
                public_key: Some(public_key.to_string()),
                private_key: None,
            }
        }
    };

    // Retrieve the private key
    match entry.get_password() {
        Ok(retrieved_key) => KeyResponse {
            success: true,
            message: "Private key retrieved successfully".to_string(),
            public_key: Some(public_key.to_string()),
            private_key: Some(retrieved_key),
        },
        Err(err) => {
            // Handle any error during retrieval
            KeyResponse {
                success: false,
                message: format!("Failed to retrieve private key: {}", err),
                public_key: Some(public_key.to_string()),
                private_key: None,
            }
        }
    }
}

#[tauri::command]
fn delete_private_key(public_key: &str) -> KeyResponse {
    // Define service and username for the keyring entry
    let service = "nostria-signer";
    let username = format!("{}-{}", service, public_key);

    // Create a keyring entry
    let entry = match Entry::new(service, &username) {
        Ok(entry) => entry,
        Err(err) => {
            return KeyResponse {
                success: false,
                message: format!("Failed to create keyring entry: {}", err),
                public_key: Some(public_key.to_string()),
                private_key: None,
            }
        }
    };

    // Delete the private key
    match entry.delete_password() {
        Ok(_) => KeyResponse {
            success: true,
            message: format!("Private key for {} successfully deleted", public_key),
            public_key: Some(public_key.to_string()),
            private_key: None,
        },
        Err(err) => KeyResponse {
            success: false,
            message: format!("Failed to delete private key: {}", err),
            public_key: Some(public_key.to_string()),
            private_key: None,
        },
    }
}

// Add wake lock command for mobile platforms
#[tauri::command]
fn keep_awake(state: bool) -> bool {
    #[cfg(target_os = "android")]
    {
        if let Some(android_activity) = window.get_main_window().and_then(|w| w.app_handle().android_activity()) {
            if state {
                android_activity.acquire_wake_lock("nostria-signer:wake-lock");
                return true;
            } else {
                android_activity.release_wake_lock();
                return true;
            }
        }
        false
    }
    #[cfg(not(target_os = "android"))]
    {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_private_key,
            get_private_key,
            delete_private_key,
            keep_awake
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
