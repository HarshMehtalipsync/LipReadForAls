# LipReadForAls
Using LLM to enable lip reading capabilities giving voice to my father struggling with ALS

## Lip Cue

Two pages that read silently mouthed Gujarati sentences from a camera.

- `index.html` is the page for daily use: press Record, mouth a sentence, press Stop. It shows and speaks the closest taught sentence.
- `train.html` is the training page: add sentences, teach each one a few times, check how well they separate, back up the training.

Everything runs in the browser. Video never leaves the device. Taught clips are stored as lip measurements in the browser's local storage.

### Hosting

Any static HTTPS host works (GitHub Pages, Azure Static Web Apps). The camera only works over HTTPS or on localhost.
To try it on a laptop: `python -m http.server 8000`, then open http://localhost:8000.

Keep the `fm` folder next to the pages. Files ending `.data.wasm` and `.binarypb.wasm` are tracker data files with a renamed ending; leave the names alone.

### Cloud storage and sign-in (Azure Static Web Apps)

The app has its own accounts: an email and a password. The main admin comes from settings; the admin creates every other account on the Training page. Signed-in people share one training set, kept in a private storage container. Lip measurements and face-point positions are uploaded; video is not.

Settings on the Static Web App (Environment variables):

| Name | What it is |
|---|---|
| `STORAGE_CONNECTION` | Connection string of the storage account. It needs a private container named `training`. |
| `ADMIN_EMAIL` | Email the main admin signs in with |
| `ADMIN_PASSWORD` | The main admin's password |
| `SESSION_SECRET` | Any long random text. Changing it signs everyone out. |
| `SPEECH_KEY`, `SPEECH_REGION` | Optional: Azure Speech, for a Gujarati voice |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT` | Optional: a language model for the mouth-shape reader |

`/api/health` reports which of these are set. Passwords of created accounts are stored hashed. A sign-in lasts 30 days on a device and is kept in that browser's storage. This is deliberately simple: there is no lockout after wrong passwords and no password recovery by email.

### Tested and not tested

Tested in desktop Chromium: teaching and reading with simulated mouthing, a simulated camera including a feed turned on its side, storage across page loads, and the tracker on one photo with parts of the face covered.

Cloud save and load were tested against a stand-in server and an in-memory stand-in for Azure storage.

Not tested: the real Azure deployment and sign-in, a real person lying down, and a real covered face.
