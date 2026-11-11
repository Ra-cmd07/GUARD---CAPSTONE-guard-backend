# Allow Node.js through Windows Firewall for backend access
# Run as Administrator!

Write-Host "🔥 Adding Windows Firewall rule for Node.js backend..." -ForegroundColor Green

# Add firewall rule for Node.js
New-NetFirewallRule -DisplayName "Node.js Backend (Port 5000)" `
    -Direction Inbound `
    -LocalPort 5000 `
    -Protocol TCP `
    -Action Allow `
    -Profile Private,Public `
    -ErrorAction SilentlyContinue

Write-Host "✅ Firewall rule added!" -ForegroundColor Green
Write-Host ""
Write-Host "Now test:" -ForegroundColor Yellow
Write-Host "  curl http://10.194.43.63:5000/api/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "If it works, ESP32 will now be able to reach the backend!" -ForegroundColor Green
