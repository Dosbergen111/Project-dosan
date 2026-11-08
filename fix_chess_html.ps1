#!/usr/bin/env powershell
# Этот скрипт исправляет chess.html с минимальным вмешательством

$file = "c:\Users\User\Music\Новая папка\chess.html"
$content = Get-Content $file -Raw -Encoding UTF8

# Удаляем всю повреждённую часть с логаут кнопкой
$content = $content -replace '(?s)<button class="auth-button"[^>]*showPaymentPage[^>]*>.*?</button>.*?onclick="logout\(\)">🚪 Выйти</button>\s*<button class="logout-button"[^>]*onclick="logout\(\)">🚪 Выйти</button>', '</span>
            <button class="auth-button" style="background: linear-gradient(90deg, #ffd700, #ffed4e); color: #000; font-weight: bold;" onclick="showPaymentPage()">💎 Премиум</button>
            <button class="logout-button" onclick="logout()">🚪 Выйти</button>'

Set-Content -Path $file -Value $content -Encoding UTF8
Write-Host "✅ chess.html исправлен!"
