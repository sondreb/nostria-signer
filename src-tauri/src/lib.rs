// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use keyring::Entry;
use log::{debug, error, info};
use serde::Serialize;

#[derive(Serialize)]
struct KeyResponse {
    success: bool,
    message: String,
    public_key: Option<String>, // Optional field for public key
    private_key: Option<String>, // Optional field for private key
}

#[tauri::command]
fn save_private_key(public_key: &str, private_key: &str) -> KeyResponse {
    debug!("Attempting to save private key for public key: {}", public_key);
    // Define service and username for the keyring entry
    let service = "nostria-signer";
    let username = format!("{}-{}", service, public_key); // Fixed string concatenation
    
    debug!("Using service: {}, username: {}", service, username);
    
    // Create a keyring entry
    let entry = match Entry::new(service, &username) {
        Ok(entry) => {
            debug!("Keyring entry created successfully");
            entry
        },
        Err(err) => {
            error!("Failed to create keyring entry: {}", err);
            return KeyResponse {
                success: false,
                message: format!("Failed to create keyring entry: {}", err),
                public_key: Some(public_key.to_string()),
                private_key: None,
            }
        },
    };
    
    // Store the private key
    match entry.set_password(private_key) {
        Ok(_) => {
            info!("Private key for {} successfully stored", public_key);
            KeyResponse {
                success: true,
                message: format!("Private key for {} successfully stored", public_key),
                public_key: Some(public_key.to_string()),
                private_key: None,
            }
        },
        Err(err) => {
            error!("Failed to store private key: {}", err);
            KeyResponse {
                success: false,
                message: format!("Failed to store private key: {}", err),
                public_key: Some(public_key.to_string()),
                private_key: None,
            }
        },
    }
}

#[tauri::command]
fn get_private_key(public_key: &str) -> KeyResponse {
    debug!("Attempting to retrieve private key for public key: {}", public_key);
    // Define service and username for the keyring entry
    let service = "nostria-signer";
    let username = format!("{}-{}", service, public_key); // Fixed string concatenation
    
    debug!("Using service: {}, username: {}", service, username);
    
    // Create a keyring entry
    let entry = match Entry::new(service, &username) {
        Ok(entry) => {
            debug!("Keyring entry created successfully");
            entry
        },
        Err(err) => {
            error!("Failed to create keyring entry: {}", err);
            return KeyResponse {
                success: false,
                message: format!("Failed to create keyring entry: {}", err),
                public_key: Some(public_key.to_string()),
                private_key: None,
            }
        },
    };
    
    // Retrieve the private key
    match entry.get_password() {
        Ok(retrieved_key) => {
            debug!("Private key retrieved successfully, key length: {}", retrieved_key.len());
            KeyResponse {
                success: true,
                message: "Private key retrieved successfully".to_string(),
                public_key: Some(public_key.to_string()),
                private_key: Some(retrieved_key),
            }
        },
        Err(err) => {
            // Handle any error during retrieval
            error!("Failed to retrieve private key: {}", err);
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
    debug!("Attempting to delete private key for public key: {}", public_key);
    // Define service and username for the keyring entry
    let service = "nostria-signer";
    let username = format!("{}-{}", service, public_key);
    
    debug!("Using service: {}, username: {}", service, username);
    
    // Create a keyring entry
    let entry = match Entry::new(service, &username) {
        Ok(entry) => {
            debug!("Keyring entry created successfully");
            entry
        },
        Err(err) => {
            error!("Failed to create keyring entry: {}", err);
            return KeyResponse {
                success: false,
                message: format!("Failed to create keyring entry: {}", err),
                public_key: Some(public_key.to_string()),
                private_key: None,
            }
        },
    };
    
    // Delete the private key
    match entry.delete_password() {
        Ok(_) => {
            info!("Private key for {} successfully deleted", public_key);
            KeyResponse {
                success: true,
                message: format!("Private key for {} successfully deleted", public_key),
                public_key: Some(public_key.to_string()),
                private_key: None,
            }
        },
        Err(err) => {
            error!("Failed to delete private key: {}", err);
            KeyResponse {
                success: false,
                message: format!("Failed to delete private key: {}", err),
                public_key: Some(public_key.to_string()),
                private_key: None,
            }
        },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    env_logger::init();
    debug!("Starting Nostria Signer application");
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_private_key, get_private_key, delete_private_key])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
