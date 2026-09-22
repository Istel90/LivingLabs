$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$caBundle = Join-Path $root '.runtime-secrets/windows-root-cas.pem'
$previousCa = $env:NODE_EXTRA_CA_CERTS
try {
  # Reuse the existing Windows trust bundle; TLS verification stays enabled.
  if (Test-Path -LiteralPath $caBundle) { $env:NODE_EXTRA_CA_CERTS = $caBundle }
  & node (Join-Path $PSScriptRoot 'run.mjs')
  $auditExitCode = $LASTEXITCODE
} finally {
  $env:NODE_EXTRA_CA_CERTS = $previousCa
}
exit $auditExitCode
