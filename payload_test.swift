import Foundation
let str = "eyJvayI6dHJ1ZSwidXNlciI6eyJpZCI6IjFiNDY4M2ZiLTZiYmEtNDA4Ni1hMGNiLWE0NjhhNjRiNWMyYyIsImVtYWlsIjoiIiwi" // fake payload
if let d = Data(base64Encoded: str) {
    print("Success")
} else {
    print("Failed")
}
