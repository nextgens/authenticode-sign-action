# Authenticode cloud signer

This action signs files that are supported by `signtool.exe` with a key hosted on google KMS. This enables EV code-signing certificates to be used in a CI pipeline. It only works on Windows and should run on `windows-latest`.

This is a forked/cloudified version of dlemstra/code-sign-action/

## Inputs

### `certificate`

**Required** The base64 encoded certificate chain in PEM format.

### `key-uri`

**Required** The google KMS resource ID to use.

### `credentials`

**Required** The base64 encoded JSON credentials to use.

### `folder`

**Required** The folder that contains the libraries to sign.

### `recursive`

**Optional** Recursively search for DLL files.

## Example usage

```
runs-on: windows-latest
steps:
  uses: nextgens/authenticode-sign-action@v1
  with:
    certificate: '${{ secrets.CERTIFICATES }}'
    key-uri: 'projects/myProject/locations/europe-west2/keyRings/code-signing/cryptoKeys/ev/cryptoKeyVersions/1'
    credentials: '${{ secrets.GOOGLE_APPLICATION_CREDENTIALS }}'
    folder: 'files'
    recursive: true
```
