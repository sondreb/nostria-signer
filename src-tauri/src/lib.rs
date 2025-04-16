// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use keyring::Entry;

#[tauri::command]
fn save_private_key(public_key: &str, private_key: &str) -> String {
    // Define service and username for the keyring entry
    let service = "nostria-signer";
    
    // Create a keyring entry
    let entry = match Entry::new(service, public_key) {
        Ok(entry) => entry,
        Err(err) => return format!("Failed to create keyring entry: {}", err),
    };
    
    // Store the private key
    match entry.set_password(private_key) {
        Ok(_) => (),
        Err(err) => return format!("Failed to store private key: {}", err),
    };
    
    // Return a success message
    format!("Private key for {} successfully stored", public_key)
}

#[tauri::command]
fn get_private_key(public_key: &str) -> String {
    // Define service and username for the keyring entry
    let service = "nostria-signer";
    
    // Create a keyring entry
    let entry = match Entry::new(service, public_key) {
        Ok(entry) => entry,
        Err(err) => return format!("Failed to create keyring entry: {}", err),
    };
    
    // Retrieve the private key
    match entry.get_password() {
        Ok(retrieved_key) => {
           retrieved_key
        },
        Err(err) => {
            // Handle any error during retrieval
            format!("Hello, {}! Failed to retrieve private key: {}", public_key, err)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_private_key])
        .invoke_handler(tauri::generate_handler![get_private_key])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
