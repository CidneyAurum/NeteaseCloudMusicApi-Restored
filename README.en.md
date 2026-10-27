# NeteaseCloudMusicApi Restored

[中文说明](README.md) · [API quick start](docs/API-QUICKSTART.md) · [Attribution and provenance](NOTICE.md)

This is a restoration of the **published npm source for Binaryify's NeteaseCloudMusicApi 4.32.0**. It is independently maintained, is not a new release from the original author, and is not an API written from scratch.

Repository: <https://github.com/CidneyAurum/NeteaseCloudMusicApi-Restored>.

The original GitHub repository is archived and its README points to GitLab. The npm release remains available. This project recovers the files distributed in that npm package; it does not recover the original Git history or files omitted from the package. Release metadata, the original README and file hashes are retained under [provenance/](provenance/). See [NOTICE.md](NOTICE.md) for details.

## Changes in this restoration

- Retains the upstream API modules, MIT license and original attribution.
- Binds to `127.0.0.1:3000` by default, without an online version check or a blocking anonymous-registration step during startup.
- Creates a missing anonymous-token cache without overwriting an existing cache.
- Updates runtime dependencies and isolates cached POST results by request parameters and account session.
- Disables cross-origin access and proxy trust by default, caps request/upload sizes, and logs method, path and status without query strings or request bodies.
- Adds offline tests. These tests do not establish that every upstream NetEase endpoint currently works online.

This is not an official NetEase service and does not provide membership, paid-content or DRM bypasses. Availability depends on NetEase's protocol, account permissions, region and service status.

## Run locally

Use **Node.js 22 or newer** and npm:

```sh
npm ci
npm start
```

The default service address is `http://127.0.0.1:3000`:

```sh
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/inner/version
```

Use `curl.exe` in Windows PowerShell to avoid its `curl` alias.

Set process environment variables to change configuration:

```sh
HOST=127.0.0.1 PORT=3001 npm start
```

For PowerShell:

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '3001'
npm start
```

See [.env.example](.env.example). To use a copied `.env` file explicitly, run `node --env-file=.env app.js`; ordinary `npm start` uses the process environment and should not be assumed to load `.env` automatically.

## Search songs and uploaded sounds

```sh
curl --get --data-urlencode 'keywords=Mili Hero' --data 'type=1' --data 'limit=5' http://127.0.0.1:3000/search
```

Uploaded sounds and podcast programs use search type `2000`:

```sh
curl --get --data-urlencode 'keywords=世界上最小的大果' --data 'type=2000' --data 'limit=5' http://127.0.0.1:3000/search
```

A song ID, a sound program ID and its `mainSong.id` identify different resources. Check title, artist/uploader, edition and duration before selecting a result. See the [API quick start](docs/API-QUICKSTART.md) for response shapes and program details.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `3000` | Bind port |
| `CORS_ALLOWED_ORIGINS` | Empty | Comma-separated browser origins; empty disables cross-origin access |
| `TRUST_PROXY` | `false` | Trust a proxy only when explicitly set to `true` |

JSON bodies are capped at 1 MiB and uploads at 10 MiB. These limits are not environment-configurable in the initial restoration.

The public search examples do not require a Cookie stored in the repository. For authenticated endpoints, use an account you are authorized to use and supply its Cookie locally through your calling application or an individual request. Do not commit Cookies, login results, tokens or signed media URLs. Configure access controls before exposing the service to other machines.

## Test

```sh
npm test
npm run verify:source
```

`npm run verify:source` checks all 425 published files, reports restoration changes, and
verifies the original license and attribution records. The separate `npm run smoke:public`
command performs live song/sound metadata searches without loading local cookies or
downloading audio. It accesses the upstream service and is not part of offline tests.

Default tests run offline without real NetEase credentials. Actual upstream availability requires separate, authorized live checks.

## License and origin

The baseline is `NeteaseCloudMusicApi@4.32.0`, authored by **Binaryify**. Its npm metadata records `gitHead` as `4d63e5562199115915f2ee855460ef8999873b53`; that is an upstream metadata value, not a commit in this restored repository.

The original [MIT LICENSE](LICENSE) is retained verbatim. Keep its copyright and license notice when redistributing. [NOTICE.md](NOTICE.md) records provenance and the limits of this restoration.
