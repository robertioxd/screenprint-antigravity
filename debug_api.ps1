
try {
    $headers = @{Authorization="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthYW5kZHp0aGRwenZ5bmhnbXFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTQ3NTgsImV4cCI6MjA4NzA5MDc1OH0.NhwhBQ8jgFhGIVNPPduEqVpBwlo_nM3NQE3ZepVjr8U"}
    $body = Get-Content "temp_payload.json" -Raw
    Invoke-RestMethod -Uri "https://kaanddzthdpzvynhgmqp.supabase.co/functions/v1/analyze-image" -Method Post -ContentType "application/json" -Headers $headers -Body $body
} catch {
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)"
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            $msg = $reader.ReadToEnd()
            Write-Host "Error Body: $msg"
        } else {
            Write-Host "No response stream"
        }
    } else {
        Write-Host "Exception without response: $($_.Exception.Message)"
    }
}
