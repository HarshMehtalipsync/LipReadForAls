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

### Cloud storage (Azure Static Web Apps)

When the site runs on Azure Static Web Apps and someone signs in, training is also saved to a private storage container and loads on any device signed in with the same account. Each signed-in account only sees its own data. Lip measurements and face-point positions are uploaded; video is not.

Setup in Azure: a storage account with a private container named `training`, and an environment variable on the Static Web App named `STORAGE_CONNECTION` holding that account's connection string. `/api/health` reports whether the variable is set.

### Tested and not tested

Tested in desktop Chromium: teaching and reading with simulated mouthing, a simulated camera including a feed turned on its side, storage across page loads, and the tracker on one photo with parts of the face covered.

Cloud save and load were tested against a stand-in server and an in-memory stand-in for Azure storage.

Not tested: the real Azure deployment and sign-in, a real person lying down, and a real covered face.
