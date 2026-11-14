# MauSOS — Design Decisions Log

A running record of every technical decision taken during development, why it was
taken, and what was traded away. Each entry is tagged with the report section it
feeds into.

**How to use this file:** add an entry the moment a decision is made, not later.
Reconstructing reasoning in week 6 is far harder than writing one paragraph now.

---

## Development environment

### D-01 · Expo development build rather than Expo Go
*Feeds: 5.5 Development Tools & Technologies*

Expo Go is the quickest way to run a React Native project, but it ships a fixed
set of native modules and cannot load any others. MauSOS needs native Android
SMS dispatch, which Expo Go cannot provide. Migrating from Expo Go to a
development build mid-project would mean rebuilding the toolchain at the point
of highest schedule pressure, so the development build was set up on day one.

**Trade-off:** slower first build (roughly 20 minutes versus seconds) and both
developers need the full Android SDK installed. Accepted in exchange for
avoiding a forced migration later.

### D-02 · Expo SDK 57
*Feeds: 5.5 Development Tools & Technologies*

SDK 57 was released on 30 June 2026 and uses React Native 0.86. It had been
stable for roughly three months at the start of development, with two early
regressions (a Hermes memory issue and a development startup-time issue) already
resolved in patch releases.

The alternative, pinning an older SDK, would have meant manually resolving
compatible versions for every Expo package. Using the current SDK lets
`npx expo install` resolve versions automatically.

### D-03 · Physical device as the primary test target
*Feeds: 5.6 Testing, 10 Challenges*

All development testing is performed on a physical Samsung Galaxy A50 rather
than an emulator. Three of the four hardware integrations cannot be meaningfully
tested in an emulator: GPS returns manually-set mock coordinates, the camera
renders a synthetic scene, and the accelerometer is driven by on-screen sliders
rather than actual motion. SMS cannot be sent to a real number at all.

---

## Challenges encountered during setup
*Feeds: 10 Challenges Faced*

### C-01 · Android SDK not on the system PATH
Android Studio installs the SDK but does not add `platform-tools` to the Windows
PATH, so `adb` was not recognised and the Expo build could not locate the SDK.
Resolved by setting `ANDROID_HOME` and appending `platform-tools` to the user
PATH.

Note: the obvious fix, `setx PATH "%PATH%;..."` in Command Prompt, is unsafe on
Windows. `%PATH%` expands to the combined system and user PATH, while `setx`
writes only to the user PATH, duplicating the entire system PATH and risking
truncation at 1024 characters. PowerShell's
`[Environment]::SetEnvironmentVariable(..., "User")` was used instead.

### C-02 · JDK version conflict
The first Gradle build failed with *"Gradle requires JVM 17 or later to run.
Your build is currently configured to use JVM 11."* An Oracle JDK 11
installation was ahead of any newer JDK on the system PATH.

Rather than installing another JDK, `JAVA_HOME` was pointed at the JetBrains
Runtime bundled with Android Studio (`…\Android Studio\jbr`), which is JDK 21.
Gradle reads `JAVA_HOME` in preference to the PATH, so the older Java remains
installed and available to other projects without conflict.

### C-05 · Metro served a stale bundle after an external file edit
After editing a configuration file outside the running editor on Windows,
Metro's file watcher did not register the change and the bundler reused its
cached transform, so the application ran against the previous version of the
file. `npx expo start --clear` forces a full rebundle and resolves it. Worth
knowing because the symptom — code that visibly contains a change behaving as
though it does not — is easy to mistake for a logic error.

### C-06 · A validation guard broken by find-and-replace
The Firebase configuration used the placeholder `PASTE_YOURS`, which appeared
both in the configuration object and in a check that warned while the
placeholder was still present. A project-wide find-and-replace substituted the
real API key into both, turning the check into `if (apiKey === apiKey)` —
permanently true. The warning fired despite correct configuration, and two
rounds of cache clearing were spent before the guard itself was examined.

The check was rewritten to validate the *shape* of the values (prefix, length,
expected substrings) rather than compare against a literal, so no text
substitution can invalidate it. The general lesson: a validation check that
refers to the thing it validates by literal value is fragile.

### C-07 · Firestore writes failing silently during registration
Registration appeared to succeed — the account was created and the user reached
the home screen — but no document appeared in Firestore. Two separate factors
combined to hide the cause.

First, `createUserWithEmailAndPassword` immediately fires `onAuthStateChanged`,
which switches the navigator to the main application. The profile write that
follows therefore completes after the registration screen has unmounted, so any
error it produced could not be displayed.

Second, a Firestore write does not reject when the backend is unreachable or
refuses it mid-flight; it is queued locally and the promise remains pending.
A failed write is therefore indistinguishable from a slow one.

Instrumenting each Firestore call with an explicit timeout, and adding a
diagnostic that performs one write and one read and reports the stage and error
code, identified the real cause in a single step: `permission-denied`.

All Firestore calls now carry timeouts, failures are logged with their error
code, and a missing profile document is rebuilt automatically on the next
launch rather than leaving an account permanently without one.

### C-08 · Silent SMS rejected by the platform on the test device
The SMS spike was run in week 1 specifically because silent sending was the
highest-risk assumption in the design. On the primary test device, a Samsung
Galaxy A50 (SM-A505F, Android 11), every send was rejected with:

> `Package com.android.phone (uid=1001) does not match provided uid 10559`

The first hypothesis was that Google's recommended API 31+ accessor,
`getSystemService(SmsManager::class.java)`, was mis-attributing the call. The
module was rewritten to try four accessors in turn — subscription-bound,
legacy default, and both system-service variants. Every route failed with the
identical error, which ruled out the accessor and placed the rejection inside
the vendor's telephony service. The same error on Samsung Android 11 devices is
reported on Samsung's developer forum with no published fix.

Because the spike ran in week 1, this changed the design rather than breaking
it late: see D-25.

**Isolating the cause.** The identical build was then run on a stock Android
emulator (Pixel 4 image, no vendor modifications). Silent sending succeeded
first time through the subscription-bound route, with Android confirming the
message had left the device in 503 ms. The same code therefore works on
unmodified Android and fails only on the vendor build, which confirms the
rejection is a device-specific platform defect rather than an error in the
module.

| Device | Build | Silent SMS | Route | Time |
|---|---|---|---|---|
| Samsung Galaxy A50 (SM-A505F) | Samsung Android 11 | Refused | — | — |
| Pixel 4 emulator | Stock Android | Sent | `subscription` | 503 ms |

The 503 ms figure is also the first measurement toward Goal 1's target of
contacts being notified within ten seconds of a trigger.

### C-09 · Alert photo lost because the camera was slower than the countdown
**Symptom.** On the emulator, every alert reported "The camera was not ready
in time" and carried no photo.

**Cause.** Two timing assumptions. A 4-second give-up timer fired while the
photo was still being taken and discarded it. And when the countdown ended,
the countdown screen was *replaced* by the status screen, which closed the
camera, so any capture still in progress was lost.

**Fix.** The status screen now opens *on top of* the countdown screen, so the
camera stays alive underneath and can finish. The alert still leaves on time;
a photo that misses it is sent as a follow-up (D-29). The early give-up timer
was removed; a 10-second limit now applies only after the alert has fired.
The photo is also passed to the specific alert it was taken for, since by then
sending has begun. Timing is logged (`Camera ready after … ms`, `Photo
captured after … ms`) for the testing chapter.

**Lesson.** Hardware is slower and less predictable than code paths; a feature
that depends on it should degrade into "later" rather than "never".

### C-10 · Photo upload rejected by the networking layer
**Symptom.** On the A50, every upload failed within 44 ms with
"Unsupported FormDataPart implementation"; nothing reached Cloudinary.

**Cause.** Recent Expo SDKs replace the global `fetch` with Expo's own
implementation. It does not accept React Native's `{ uri, type, name }` file
parts in a `FormData`, which is the standard way to send a file from disk in
React Native — so most tutorials' upload code fails on SDK 57.

**Fix.** Uploads (and the cancel-time delete) now use `XMLHttpRequest`, which
still goes through React Native's own networking layer and streams the file
straight from disk, with its own timeout. Logging was added for every outcome
(uploaded in N ms, rejected with HTTP status and reason, network failure).

**Lesson.** The failure was invisible until the reason was logged; the screen
only said "could not be uploaded". Every external call now logs why it failed.

### C-11 · Photo capture slower than the countdown on a real phone
**Measured (Samsung A50).** Camera ready after ~0.75 s, but the photo itself
took ~7.3 s with `quality: 0.5`, because the phone decoded the 12-megapixel
image, rotated it and re-compressed it before returning it. With a 5 s
countdown and a 2.5 s grace period the photo always missed the alert message,
and on a composer-only device (C-08) a late photo is saved to history only.

**Fix, step 1.** Capture with `skipProcessing: true`, so the camera's own
JPEG is returned untouched. Capture time on the A50 fell from 7.3 s to 2.4 s.

**Side effect.** The unprocessed photo is full resolution (several MB), and
its upload failed after 20 s on the phone's connection.

**Fix, step 2.** Ask the camera for a smaller photo instead of shrinking it
afterwards: the app reads the sizes the camera supports and picks the
smallest 4:3 size at least 1280 px on its long side, which is the size
contacts receive anyway. The upload limit was raised to 30 s as a margin. The
camera also reported "ready" twice on the A50, so a guard ensures only one
capture runs.

| Run (A50) | Camera ready | Captured | Upload |
|---|---|---|---|
| quality 0.5 (processed) | 0.74 s | 7.3 s | — (fetch bug, C-10) |
| skipProcessing, full size | 0.76 s | 2.4 s | failed after 20 s |
| skipProcessing, 1440×1080 | 0.77 s | 2.8 s | 2.8 s, 440 KB |

**Result.** The photo link is ready about 5.6 s after the countdown starts —
inside the 5 s countdown plus 2.5 s grace — so on the A50 the link now
arrives inside the alert message itself, confirmed on the device.

### C-12 · Shake too hard to trigger, and ignored the second time
**Found in testing (A50).** Even on High the shake had to be uncomfortably
hard, and a second shake shortly after the first did nothing.

**Causes.** (1) Readings were taken 10 times a second; the peak of each swing
lasts only a few hundredths of a second, so it often fell between readings
and was missed. (2) The thresholds (3.2/2.5/2.0 g) were set from typical
values rather than measured on a phone. (3) A one-minute cooldown after any
shake-started alert — intended to stop a struggle from triggering twice —
also applied after an alert was *cancelled*, so a real emergency moments after
an accidental trigger would have been ignored.

**Fix.** Readings at 20 a second; thresholds lowered to 2.7/2.2/1.8 g and
four spikes instead of five; the one-minute cooldown replaced by a 5-second
pause that starts when the alert screen closes. The countdown still guards
against accidental triggers.

**Lesson.** A safety rule (the cooldown) can itself become a hazard; each one
was re-checked against the case "the user needs help right after a false
alarm".

### C-13 · Calculator disguise covered only half the screen
**Found in testing (A50).** With stealth on, the top half of the screen still
showed the real MauSOS home screen above the calculator keypad — the
opposite of a disguise.

**Cause.** The calculator was a `SafeAreaView` given absolute "fill the
screen" positioning. On Android, `SafeAreaView` from
react-native-safe-area-context does not honour absolute positioning, so it
was laid out as an ordinary sibling of the app and the two shared the screen.

**Fix.** A plain `View` with absolute fill (and a high z-index/elevation)
now covers the whole app, with the `SafeAreaView` inside it only providing
padding around the notch.

**Lesson.** A disguise has to be checked on the device, by looking at it; the
code read correctly and passed every syntax check.

### C-14 · Calculator drawn behind the app, so "Lock now" seemed to do nothing
**Found in testing (A50).** After the C-13 fix, *Lock now* appeared to do
nothing, and opening the app from the "Calculator" icon went straight into
MauSOS.

**Diagnosis.** Logging showed the app *was* locking (`locked=true`) and
rendering the calculator — but it was invisible. The screens of the native
stack navigator (react-native-screens) are native Android views in their own
layer; an ordinary React Native view placed beside the navigator, even with
`zIndex`/`elevation` 1000, was drawn underneath them.

**Fix.** The calculator is rendered inside a React Native `Modal`, which
Android displays as a separate window above the whole app. The Android back
button is ignored while it is shown, so the disguise cannot be dismissed
without the unlock code.

**Lesson.** "Nothing happens" and "happens but is invisible" look identical
on screen; a single log line separated them immediately.

### C-15 · Calculator collapsed to one row inside the Modal
**Found in testing (A50).** After C-14 the calculator was visible but showed
only "0 . =" at the top of the screen.

**Cause.** The native `SafeAreaView` (react-native-safe-area-context)
measures itself against its host window; inside a `Modal` on Android it
reported the wrong size, and the flex layout of the display and keypad
collapsed.

**Fix.** Plain `View`s, with the notch and navigation-bar padding read from
`useSafeAreaInsets()` and applied as padding. The calculator no longer
depends on the native safe-area view at all.

### C-03 · USB debugging not detected
`adb devices` initially returned an empty list. The cause was the Android
default of connecting in charge-only mode; the USB connection must be switched
to File Transfer before ADB is exposed, in addition to enabling USB debugging in
Developer Options.

---

## Architecture and backend

### D-04 · Firebase JS SDK, registered as a Web app
*Feeds: 5.5 Development Tools & Technologies*

Two Firebase libraries exist for React Native: the official Firebase JS SDK
(`firebase`), and `react-native-firebase`, which wraps the native Android and
iOS SDKs.

The JS SDK was chosen because it requires no native configuration, works
identically across platforms, and is sufficient for the operations MauSOS needs
(email/password authentication and document CRUD). Because it communicates over
HTTPS like a web client, the project is registered in the Firebase console as a
**Web app**, not an Android app, despite being a mobile application. An Android
registration would produce a `google-services.json` file that the JS SDK does
not consume.

**Trade-off:** `react-native-firebase` offers better performance and background
capability, but adds native build complexity that the project timeline does not
accommodate.

### D-05 · Firestore Standard edition
*Feeds: 5.5 Development Tools & Technologies*

Firestore offers Standard and Enterprise editions. Enterprise provides an
advanced query pipeline engine and MongoDB compatibility, aimed at
enterprise-scale workloads with a different pricing structure.

MauSOS stores user profiles, a small number of emergency contacts per user, and
alert records. These are simple document reads and writes with no complex
querying, so Standard edition is appropriate. Standard also queues writes made
without a connection and sends them when it returns, and remains within the free
tier at this scale.

The database region is fixed permanently at creation and affects latency; this
was selected deliberately rather than accepting the default.

### D-06 · Cloudinary for media storage instead of Firebase Storage
*Feeds: 5.5 Development Tools & Technologies, 5.4 Security Implementation*

Firebase Storage now requires the Blaze pay-as-you-go billing plan, whereas
Authentication and Firestore remain available on the free Spark plan. Three
options were considered: enabling billing, using a third-party media host, or
storing captured photos only on the device.

Cloudinary was selected. Beyond avoiding the billing requirement, it suits the
use case better. Emergency contacts receive a plain SMS; they have no MauSOS
account and no Firebase credentials, so the photo link must be openable by
anyone holding it. Cloudinary returns a publicly accessible URL on upload.
Achieving the same with Firebase Storage would require either public bucket
rules or generated download tokens.

This also satisfies the assignment's encouragement of external API integration.

**Security note:** uploads use an *unsigned upload preset*, so no API secret is
embedded in the application. Any credential shipped inside an APK can be
extracted by decompiling it, so the signing secret is never placed in the
client. The preset restricts what unsigned uploads may do.

**Trade-off:** media is held by a third party rather than alongside the
application's other data, and the upload preset must be configured correctly to
prevent abuse.

---

## Security decisions
*Feeds: 5.4 Security Implementation*

### D-07 · Persistent authentication sessions
Authentication is mandatory, but it is confined to first-run setup. The session
token is written to the app's private storage via
`getReactNativePersistence(AsyncStorage)` (sandboxed by Android, but not
encrypted — moving it to encrypted storage is listed as future work) and has
no expiry, so every subsequent
launch goes directly to the alert screen.

This resolves the central tension of the application: the assignment requires
secure authentication, while the product requires zero friction at the moment of
emergency. Placing a login screen in front of the SOS button would satisfy the
first requirement and defeat the second.

Plain `getAuth()` keeps the session in memory only and would sign the user out
on every app close. Because a silent failure here would be invisible until
tested, `firebase.js` logs an explicit error rather than falling back quietly.

### D-08 · The Firebase API key is not a secret
The `apiKey` value in the Firebase configuration identifies the project; it does
not authorise access to it. Google intends it to ship inside client applications
where it can be read by anyone who extracts the APK.

Data protection is therefore provided entirely by **Firestore security rules**,
which enforce that a user may read and write only documents beneath their own
`users/{uid}` path. This distinction matters: a project can appear secure
because its keys are hidden while its database remains world-readable.

### D-09 · Asymmetric biometric protection — *planned, not built*
Biometric locking is applied to Settings and Contacts, but deliberately **not**
to the SOS trigger.

Protecting configuration prevents another person with physical access from
deleting the user's emergency contacts. Protecting the trigger would place a
fingerprint prompt between a frightened user and the alert, at a moment when
their hands may be unsteady, wet, or restrained.

**Outcome:** not implemented within the timeline; the principle (never put a
lock in front of the trigger) still guided the stealth design (D-33).

### D-10 · Append-only alert history
Firestore rules permit `create` and `update` on alert documents but deny
`delete`. Alert history is an audit trail: it records where the user was, when,
and what was captured. Allowing deletion would let an attacker with brief access
to an unlocked phone erase evidence.

### D-11 · Password reset does not confirm whether an account exists
The password reset screen shows the same confirmation message regardless of
whether the address is registered. Reporting "no account found" would allow
anyone to test which email addresses have accounts, an account-enumeration
weakness.

**Correction found by fact-checking the report:** the code still mapped
`auth/user-not-found` to "No account found", on both sign-in and reset. Fixed:
reset now treats an unknown address as success (same confirmation), and
sign-in gives "Email or password is incorrect" for either mistake.

### D-36 · Least privilege: unused permissions removed
`RECEIVE_BOOT_COMPLETED` (left over from the abandoned background service)
was removed from `app.json`, and the camera plugin's default microphone
permission was turned off (`recordAudioAndroid: false`) since only still
photos are taken. Takes effect at the next prebuild and build.

### D-23 · Production security rules written in week 1, not test mode
Firebase offers a "test mode" that grants unrestricted read and write access and
expires thirty days after creation. On a project running several weeks, those
rules would have stopped working close to submission, producing a sudden and
confusing failure at the worst possible time.

The database was instead created in production (locked) mode and the real rules
written immediately. This surfaced as an early `permission-denied` error, which
was the correct behaviour: the database was refusing unauthenticated-looking
writes exactly as intended. Writing the rules properly removed the expiry risk
and completed a graded deliverable in week 1 rather than week 4.

The rules are kept in `firestore.rules` at the repository root so they are
version-controlled alongside the code rather than existing only in the console.

### D-24 · Self-healing profile documents
If the Firestore write during registration fails, the authentication account
exists while its profile document does not — a state the user cannot escape by
retrying registration, because the email is already taken.

`AuthContext` therefore treats a missing profile as a repairable condition
rather than an error: when a signed-in user has no profile document, it rebuilds
one from the authentication record. Fields that existed only in the registration
form, such as the phone number, cannot be recovered and are left blank for the
user to complete in Settings.

### D-25 · Two-channel SMS dispatch with automatic fallback
Alerts are sent by silent SMS where the platform allows it, falling back
automatically to the system messaging app — with every contact and the full
alert text prefilled — where it does not.

Silent sending cannot be assumed: iOS provides no API for it, and some Android
vendor builds reject it (C-08). An alert that silently failed to send would be
the worst possible outcome, so the composer guarantees a route off the phone at
the cost of a single tap.

The fallback is selective. If silent sending reaches some contacts but not
others, only the failed contacts go to the composer. If silent sending failed
for a transient reason — no signal, no credit — the composer is not offered,
since it would fail for the same reason.

The composer cannot report whether the user actually pressed send, so such
alerts are recorded as `opened` rather than `sent`. The history records what is
known rather than claiming a delivery that cannot be confirmed.

### D-26 · Emergency contacts: ordered, atomic, live, and validated twice
Contacts are stored at `users/{uid}/contacts/{id}` with a contiguous
`priority` (1, 2, 3 …). Priority 1 is reached first and is the person the call
fallback will dial, so the order on screen is exactly the order used in an
emergency. Reordering and deletion rewrite priorities in a single Firestore
write batch, so the change is atomic: the list can never be left with a gap or
two contacts sharing first place.

The contact list is held in one live subscription (`ContactsContext`), opened
at sign-in, rather than fetched by each screen. When an alert fires the
contacts are already in memory, so triggering never waits on a network read.

Validation runs twice. The app rejects a blank name, a malformed number, the
user's own number, and a number already held by another contact, with a
message under the field that names the problem. The security rules then
enforce the same constraints server-side — allowed fields only, name length,
E.164 phone format, a known relationship, priority between 1 and 5 — because
client-side checks can be bypassed by anyone calling the API directly.

A maximum of five contacts keeps dispatch quick and the per-alert SMS cost
predictable. Deleting the last remaining contact is permitted but warns that
alerts will then have nobody to reach.

### D-27 · Hold-to-trigger, a cancellable countdown, and location found in parallel
The SOS button requires a continuous three-second hold. A tap does nothing,
which rules out pocket presses without adding a confirmation dialog. Feedback
while holding is physical as well as visual — a fill growing from the centre,
a haptic tick each second, a strong pulse on completion — so it works without
looking at the screen. Releasing early cancels silently.

A five-second countdown follows, full-screen red with a vibration each second,
so an accidental trigger is noticed by feel. Cancelling is one tap on a target
filling the bottom of the screen, or the hardware back button.

Location acquisition starts the instant the hold completes, not when the
countdown ends. The GPS fix runs during the countdown, so by the time the
alert sends the position is usually known, and the delay between the countdown
ending and contacts receiving the message is only the dispatch itself. The
countdown screen shows the fix as it arrives, so the user sees what their
contacts will receive before it is sent.

If a fresh fix does not arrive within ten seconds, the last position Android
already holds is used if under thirty minutes old, and the message says so.
If there is no position at all, the alert still sends. Reverse geocoding needs
data and is bounded by its own short timeout; when it fails the message
carries coordinates and a map link instead.

Permission prompts are raised from the SOS screen ahead of time, never during
an alert, so an emergency is never interrupted by a system dialog.

### D-28 · Alert records are immutable evidence
Every alert produces a record, including cancelled ones, so accidental
triggers appear in the history alongside real alerts. The record is written
once, after dispatch, with its location, recipients, per-contact outcome,
channel and send time.

The security rules enforce what may happen to it afterwards. New records must
match an exact field list with known status and trigger values. Updates may
change only `status`, `resolvedAt` and `updatedAt`, and only to `resolved` or
`falseAlarm` — or set a missing photo link once (D-29). Deletion is denied to everyone. The location, time and
recipients of an alert therefore cannot be altered or removed once written, by
the user or by anyone who has taken their phone.

The document id is generated locally before the write, so if the write cannot
be confirmed in time — no signal — the id is still known and Firestore keeps
retrying in the background while the app is open.

### D-29 · A silent photo during the countdown, uploaded to Cloudinary
*Feeds: 5.3 Features, 6 Device Integration, 7 Security*

**What.** When the countdown starts, a small 84 × 84 camera preview appears in
its corner. Once the camera is ready (plus 700 ms for exposure to settle) it
takes one photo with the shutter sound and shutter animation turned off, shows
the thumbnail, and starts uploading it straight away — while the countdown is
still running. The rear camera is the default, because it shows the scene and
the people around the user; the front camera is a setting.

**Why during the countdown.** The countdown is five seconds the user is
already waiting. Capturing and uploading inside that window means the photo
link is usually ready when the message is built, at no cost to how fast the
alert leaves.

**The alert never waits for the photo.** Sending gives a still-uploading photo
a 2.5 s grace period. If it is not ready by then, the alert goes without it
and the photo follows as a second SMS once uploaded (up to 60 s), and is
attached to the history record. The follow-up SMS is only sent when the alert
went out silently: on a device that needed the messaging app (C-08), a second
composer would ask for another tap from someone who may not be able to give
it, so there the photo is saved to the record only.

**Every failure is explicit.** Photos turned off, no camera permission, a
camera that never becomes ready (4 s), a capture error or a failed upload each
resolve the photo with a reason instead of leaving it pending, so the pipeline
can never hang on a picture. The status screen shows a Photo step with the
thumbnail and a plain-language outcome.

**Cancelled alerts leave no photo online.** Uploads ask Cloudinary for a
delete token (valid for 10 minutes). If the user cancels, the photo is deleted
with that token as soon as its upload finishes. The cancelled record stores no
photo link.

**Security.** The upload uses an *unsigned* preset, so no API secret is
shipped in the APK (anything in an APK can be extracted). The preset itself is
the control. As configured (preset `mausos_alerts`, cloud `sfzkevwm`):
signing mode unsigned; asset folder `mausos/alerts`; public id auto-generated
and unguessable; "disallow public id" on, so an uploader cannot choose or
target a name; use filename off; unique filename on; overwrite off; return
delete token on. Anyone can extract the preset name from the APK, so these
settings, not secrecy, are what limit what an unsigned upload can do. Contacts receive a resized delivery URL (`w_1280,q_auto`) so the picture
opens quickly on mobile data.

The security rules were extended to allow one extra change to an alert
record: setting `photoUrl`, once, if it is currently empty, and only to a
`https://res.cloudinary.com/` address. A recorded photo can never be replaced,
so D-28 still holds.

**Trade-off.** A public link to the photo exists for as long as it is stored.
This is accepted because contacts have no MauSOS account; the random filename
is what keeps it private in practice.

### D-30 · Alert history: live, read-only, and honest about cancellations
*Feeds: 5.3 Features, 4 UI/UX Design, 7 Security*

**What.** A History tab, placed beside the SOS tab, lists the last 50 alerts
newest first. Each row shows the status (colour and icon), time, a one-line
summary ("Sent to 2 of 2 contacts"), the address and a photo thumbnail.
Tapping a row opens the full record: status banner, photo (tap for full
size), address and coordinates with accuracy and an *Open in Maps* button,
each contact with whether it was reached and how, trigger method, sending
channel, time to send and when it was resolved.

**Live, not fetched.** Both screens use Firestore listeners. A photo that is
attached after the alert, or an all-clear sent from the status screen,
appears immediately without pulling to refresh.

**Sorted by the phone's clock.** The list orders by `clientTriggeredAt`
rather than the server timestamp, because a record written without signal
has no server time yet but still belongs at the top.

**Cancelled alerts are shown, with a filter.** An accidental trigger is
still worth seeing, so nothing is hidden by default; a *Sent only* chip
removes them when the list gets crowded with tests.

**Read-only by design.** There is no edit or delete control, matching the
security rules (D-28). The only action is the all-clear on an alert that is
still open, which sends "you are safe" to everyone reached and marks the
record resolved.

**Red stays meaningful.** Only an open, sent alert is red. Resolved alerts
are green, undelivered ones amber, cancelled ones grey, so the screen does
not shout about events that are over.

**Maps without a map library.** The detail screen links out to Google Maps
instead of embedding a map. An embedded map needs a native library, a
rebuild and an API key; the link gives the same practical result — directions
to the spot — with none of those costs. Thumbnails are requested from
Cloudinary at 160 px (`w_160,h_160,c_fill`), so the list never downloads the
full photos.

### D-31 · Settings save instantly, live on the account, and apply at once
*Feeds: 5.3 Features, 4 UI/UX Design*

**What.** A Settings tab (last in the bar: visited rarely, never in a hurry)
with: the user's details (name and phone, edited on their own screen with the
same validation as registration); countdown length (3/5/10/15 s); photo on or
off; back or front camera; a shortcut to Android's permission settings;
change password (reset email); and sign out, with a warning that alerts stop
working while signed out.

**No Save button.** Each choice saves the moment it is made. The change is
applied to the in-memory profile first, so the control responds instantly and
every screen — the countdown, the camera — uses the new value straight away;
the Firestore write follows in the background. If the server refuses it, the
change is rolled back and the user told. Without signal the write is not an
error: Firestore holds it and sends it later, and the screen says "Saved on
this phone. It will sync when you are back online."

**Stored on the account, not the phone.** Settings are part of the Firestore
profile, so they survive a reinstall or a new phone.

**Segmented controls, not dropdowns.** Every option is visible and one tap
away, which suits settings with three or four values.

**Plain-language consequences.** Each setting says what it changes in an
emergency — e.g. the countdown note explains the trade-off between time to
cancel and time to help — because the person adjusting it is deciding how the
app behaves when they may not be able to think it through.

**The user's own number cannot also be a contact.** Checked both when adding
a contact and when editing the profile, since an alert sent to oneself
reaches nobody.

### D-32 · Shake to alert: deliberate, foreground-only, cancellable
*Feeds: 5.3 Features, 6 Device Integration (accelerometer)*

**What.** With *Shake to alert* on (Settings), shaking the phone hard opens
the same countdown as the SOS button, from any tab. The countdown shows
"Shake detected", the record stores `triggerMethod: 'shake'`, and the SOS
screen reminds the user "Or shake your phone hard".

**Detection.** The accelerometer is read 20 times a second and the total
acceleration computed (√(x²+y²+z²), in g). Still ≈ 1 g; walking or a bag
bouncing peaks around 1.2–1.5 g. A spike above the threshold (Low 2.7 g,
Medium 2.2 g, High 1.8 g) is counted; four spikes within 1.5 s fire the
alert. Spikes closer than 100 ms count once, since one swing of the arm
produces several readings. A single knock or drop therefore cannot trigger it.
(Values tuned on the A50 — see C-12.)

**Layers against false alarms.** (1) Several strong spikes in a short
window; (2) the cancellable countdown; (3) shakes are ignored while an alert
is on screen and for 5 s after it closes, so the same burst of shaking cannot
start a second alert.

**Foreground only — a deliberate limitation.** Listening with the app closed
would need an Android foreground service with a permanent notification, which
Expo's managed modules do not provide, and continuous sensor use drains the
battery. The listener therefore runs only while the app is in the foreground
and stops when it is backgrounded. This is stated in Settings so users do not
rely on it with the app closed. Background shake is listed as future work.

**Off by default.** Shaking is a common, involuntary movement (running,
sport), so the user opts in.

**Defensive loading.** The sensor library is loaded lazily and checked with
`isAvailableAsync()`. On a phone or build without it, the setting is shown as
unavailable instead of the app failing to start.

### D-33 · Stealth mode: a working calculator with an unlock code and a duress code
*Feeds: 5.3 Features, 7 Security, 4 UI/UX Design*

**Who it is for.** Someone whose phone may be checked by the person they are
in danger from. A visible safety app can itself provoke harm; a calculator
does not.

**What.** With stealth mode on, MauSOS opens as a plain, fully working
calculator (normal precedence, %, delete, clear) styled like a stock
calculator rather than in MauSOS colours, with nothing on it naming the app.
It locks again whenever the app goes to the background. Pressing = on a bare
4–8 digit number also checks it:
- the **unlock code** opens MauSOS;
- the **duress code** sends an alert silently — no countdown, no camera,
  no vibration, no change on screen; the calculator simply shows the number,
  as = would on any number.

**The duress message is different.** It says the person "may be in danger
and cannot talk freely" and tells contacts *not* to call or text back but to
contact the police (999), because a reply arriving in front of the aggressor
could give the alert away. The user's phone number is left out for the same
reason.

**Never visible, even if that means not sending.** A duress alert must not
show anything, so it never asks for a permission and never opens the
messaging app (the fallback used by normal alerts on phones like the A50,
C-08). If the phone cannot send SMS silently, the duress alert is recorded in
history with status "not delivered" and contacts are not messaged. The setup
screen tells the user this in advance, and checks whether silent SMS is
currently available on their phone. Repeats within a minute are ignored, so
pressing = again does not resend.

**Code storage (Security).** Codes are never stored as typed. Each is salted
(random per phone) and hashed with SHA-256, repeated 500 times, and only the
hashes are kept, in expo-secure-store — on Android, encrypted with a key held
in the Android Keystore. The app cannot read the codes back, only check a
typed code. SHA-256 is implemented in plain JavaScript (verified against
Node's crypto) so no native crypto module and rebuild were needed; 500 rounds
keep the check at roughly 0.2 s on the A50, slowing any brute-force attempt
without making = feel sluggish. Codes stay on the phone, not in Firestore:
the disguise must work before sign-in finishes and with no signal, and the
codes are then never transmitted. Validation: 4–8 digits, not one repeated
digit, typed twice, and the two codes must differ.

**Drawn over the app, not instead of it.** The calculator is a full-screen
window (a `Modal`, see C-14) above the navigator, so anything already running — an alert being sent — keeps
running underneath. The app does not lock while an alert screen is open
(sending through the messaging app briefly leaves MauSOS), and shake
detection is switched off while the calculator shows, because a countdown
hidden behind it could not be seen or cancelled.

**Limits, stated honestly.** The app's name in the recent-apps list is
MauSOS. (The native splash shown at cold start is now a plain background with
no logo, D-37, so it no longer gives the disguise away.) If the unlock code is forgotten, reinstalling the app removes
it (the account and history are unaffected). The home-screen icon is handled
by D-34.

### D-34 · The home-screen icon follows stealth mode
*Feeds: 5.3 Features, 6 Device Integration, 4 UI/UX Design*

**What.** While stealth mode is on, the app appears on the home screen and in
the app drawer as a generic calculator icon named "Calculator", and opens to
the calculator lock. Turning stealth mode off restores the MauSOS icon and
name, and the app opens straight into MauSOS again.

**Why not the phone's own calculator.** Opening MauSOS from the phone's
built-in calculator app was considered. Android keeps each app's input
private to that app, so MauSOS cannot receive what is typed into another
app's calculator. A disguise inside MauSOS itself, plus a disguised icon, is
the approach used by calculator-vault apps and keeps everything within
MauSOS's own sandbox.

**How.** An Expo config plugin (`modules/mausos-icon/app.plugin.js`) rewrites
the Android manifest at prebuild: the launcher entry moves off MainActivity
onto two activity aliases that both open MainActivity — `.LauncherDefault`
(MauSOS) and `.LauncherCalculator` (calculator icon, label "Calculator"). A
small Kotlin module enables one and disables the other through
`PackageManager.setComponentEnabledSetting`, enabling the new entry before
disabling the old so there is never a moment with no icon, and with
`DONT_KILL_APP` so the app keeps running. No permission is needed: an app may
always enable or disable its own components. The plugin was tested on a
sample manifest, including running twice without duplicating entries.

**The icon** is an original, generic design — a display and a keypad with
one orange key — drawn as vector shapes (adaptive icon on Android 8+, a
rounded-square vector before that), so it is sharp at every size and needs no
image files.

**Limits.** Launchers can take a few seconds to redraw, and some remove a
home-screen shortcut to the old entry (the app drawer always shows the
current one). The JavaScript side loads the module optionally, so a build
without it simply keeps the normal icon.

### D-37 · UI polish from a full screenshot review
*Feeds: 4 UI/UX Design, 9 Testing*

All 23 screens were captured on the Samsung A50 and reviewed together.
Findings and changes:
- **Native splash.** The first frame at launch showed Expo's placeholder
  image (a grey grid), because SDK 57 takes the native splash from the
  `expo-splash-screen` plugin, which had not been installed; the old top-level
  `splash` setting is ignored. The plugin is now configured with a plain
  background and no logo. MauSOS's own loading screen (logo and spinner) follows
  immediately, and in stealth mode the first frame no longer shows the MauSOS
  logo before the calculator appears.
- **Truncated history rows.** The duress summary was cut off
  ("…this phone bloc…"); shortened to "Saved silently, SMS blocked".
- **Screen readers.** The SOS screen's status pills and the alert status
  steps are now read as single items ("Location: done. QGG5+832, Moka"),
  instead of separate icons and fragments.
- **Developer build artefacts.** The floating gear button on every screen and
  the "Developer tools" link exist only in development builds; screenshots
  for the report and the demo video are taken from a release build.

### D-12 · Input validation and sanitisation
All user input passes through `src/utils/validators.js` before reaching
Firestore. Validation covers email format, password strength (minimum 8
characters with at least one letter and one digit), name length, and phone
number format. Sanitisation strips control characters, collapses whitespace, and
enforces maximum lengths.

Phone numbers are normalised to E.164 format (`+230…`) at the point of entry, so
the SMS layer never has to infer a country code.

### D-13 · Firebase error codes are mapped to human-readable messages
Firebase returns machine-readable codes such as `auth/wrong-password`. These are
mapped to plain sentences in `authService.js`, with any unmapped code falling
back to a generic message rather than exposing internal detail.

---

## User interface decisions
*Feeds: 5.3 Features, 4 UI/UX Design*

### D-14 · Centralised design tokens
Every colour, spacing value, corner radius and text style is defined in
`src/utils/theme.js`. No StyleSheet in the application hardcodes a hex value or
a pixel measurement.

This keeps spacing and colour consistent across screens without relying on each
screen's author to remember the values, and allows the entire interface to be
restyled from one file.

### D-15 · Navigation driven by authentication state
No screen calls `navigation.navigate()` to sign a user in or out. `RootNavigator`
renders either the authentication stack or the main application depending on
whether a user is present in `AuthContext`.

Consequently there is no code path that can leave the user on a signed-in screen
without a valid session, or on the login screen while authenticated. Signing out
anywhere in the app returns to login automatically.

### D-16 · Splash screen during session restoration
`AuthContext` exposes an `initialising` flag that is true until Firebase reports
the restored session. While it is true, a splash screen is shown.

Without this, the login screen renders for a fraction of a second on every
launch before being replaced by the home screen — a flicker that makes the
application feel unfinished.

### D-17 · Inline field errors rather than alert dialogs
Validation errors appear beneath the field they relate to, not in a modal. The
user can see which field is wrong while correcting it, and errors clear as soon
as the user begins editing that field.

---

## Scope decisions
*Feeds: 11 Limitations and Future Improvements*

### D-18 · Check-in timer removed
Originally planned as a dead-man's switch: the user declares an expected arrival
time, and failing to confirm safety escalates automatically. Removed to keep
scope achievable within the available time.

Its removal left shake detection as the only hands-free trigger, so the stated
objectives were revised accordingly rather than left overstating the
application's capability.

### D-19 · Volume-button trigger removed
Three rapid volume-down presses would have triggered an alert with the device
locked. It required substantial native Android work — either a `ContentObserver`
on system volume, which stops firing once volume reaches zero, or a MediaSession
registration — and duplicated functionality that shake detection already
provides at a fraction of the cost.

### D-20 · Push notifications to contacts descoped
Push notifications would only reach contacts who have MauSOS installed. During
demonstration no contact will have the application, so the feature would be
invisible while still consuming development time. SMS reaches every contact
regardless.

### D-21 · Dynamic launcher icon switching descoped — *reversed, see D-34*
Originally descoped because on some Android versions toggling an
activity-alias force-closes the app, which an observer could notice. It was
later implemented after all (D-34): the switch uses `DONT_KILL_APP`, happens
only when the user changes the setting (never while the disguise is in use),
and was tested on the Samsung A50 without the app closing. Keeping both
entries shows the decision being revisited with evidence.

### D-22 · Background shake detection treated as a stretch goal
Shake detection in the foreground is straightforward. Detecting a shake while
the application is closed requires an Android foreground service with a
persistent notification, plus a boot receiver to survive restarts.

This was timeboxed with an explicit go/no-go decision point. Items depending on
it — background shake and reboot recovery — all fail
together if the service proves unstable, so the dependency was identified in
advance rather than discovered late.
**Outcome:** not attempted; shake works in the foreground only (D-32).

---

## Pending decisions

- [x] Silent SMS: resolved by the week 1 spike — native module as primary,
      composer as automatic fallback (D-25). Twilio was ruled out because
      Firebase Cloud Functions also require the Blaze billing plan.
- [x] Confirm silent SMS on a second device — confirmed on a stock Android
      emulator (C-08). A second physical phone on a live network would still
      strengthen the testing evidence.
- [x] Captured photo defaults to the rear camera, with the front camera as a
      setting (D-29).
- [ ] Countdown default: currently 5 seconds; to be reviewed after user testing.

## Future work (for the report's conclusion)
- **Live location sharing.** Alerts send one precise position taken at the
  moment of the alert (D-27). Following the user as they move would need
  background location permission, a service that keeps running after the app
  is closed, and a web page contacts can watch — out of scope for this
  project.
- **Shake in the background.** Needs an Android foreground service (D-32).
- **Splash screen.** Show a neutral splash while stealth mode is on (D-33).
