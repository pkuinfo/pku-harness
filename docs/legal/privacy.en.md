# Privacy Policy

Effective date: 12 November 2026

This policy explains what data PKU harness handles, where it goes, and how you control it. It applies to the PKU harness app, the website pkuharness.com, and the optional PKU harness Cloud service run by the pkuinfo contributors ("we"). PKU harness is not affiliated with Peking University.

## In short

- You don't create an account with us. We have no user database.
- Your campus password, authenticator secret and AI key stay on your phone. We never receive them.
- The app has no ads, no analytics and no tracking SDKs.
- The app talks directly to campus services and to the AI provider you choose. Our own server only sees encrypted data, and only when you use a cloud feature.

## 1. Data stored on your phone

The app keeps its data on your phone:
- **Credentials:** your student ID, password, the IAAA authenticator secret and session tokens for campus services. These are kept in Android's encrypted storage (SecureStore, protected by the Android Keystore).
- **AI settings:** the provider address, model and API key (the key in encrypted storage).
- **Your content:** chats, attachments you add, dashboard widgets, timetable, to-dos, reminders, scheduled tasks and plugin data.

This data stays on your phone. Encrypted storage is excluded from Android backups. If you turned on your phone's own cloud backup, Android may include the rest of the app's data in it, under your backup provider's terms. **Settings → Erase all data** deletes it, and uninstalling the app deletes it too. **Settings → Export data** creates a file only when you ask, and you choose where to send it.

## 2. Campus services

When you sign in or use a campus feature, the app connects directly from your phone to university systems (such as iaaa.pku.edu.cn, portal.pku.edu.cn, course.pku.edu.cn and the campus card service) and sends what that service needs, including your credentials at sign-in. This works the same way as using those services in a browser. The university's own privacy rules apply to that data. We don't see it.

## 3. Your AI provider

The assistant works by sending a conversation to the AI provider you configured (for example DeepSeek or another OpenAI-compatible service). What is sent can include:
- your messages and the attachments you add;
- results from tools the assistant uses, which can contain campus data such as your timetable, grades, balances or Treehole posts;
- in Copilot mode, the text on the screens of apps you allowed Copilot to use (the words and controls shown). Screen preview images stay on your phone and are not sent to the AI. The one exception: while "Let the AI see screenshots" is on in Copilot settings (it is on by default, and you can turn it off there), for apps such as Taobao and WeChat that hide their contents from Copilot, the assistant may send screenshots of the app Copilot is operating to your AI provider. Screenshots come only from Copilot's separate screen, never from the screen you are using, and never of protected screens (such as passwords or payment pages). They are sent only when the selected model can read images, are used for that reply only, and are not kept in your chat history. You can turn this off at any time.

Your campus password and authenticator secret are never sent to the AI. The provider processes this data under its own terms and privacy policy, so choose one you trust. We don't receive this data.

**Voice input (optional).** If you set up voice input, a recording you make with the microphone button is sent from your phone to the speech-to-text service you chose (for example SiliconFlow, Alibaba Cloud Bailian or DeepSeek), with your own API key, to be turned into text. If you choose DeepSeek, it uses the DeepSeek API key from your AI settings. The service processes it under its own terms. The recording is deleted from your phone once it has been transcribed, and we never receive it. The microphone is used only while you are recording.

**DeepSeek web search and scanned PDFs.** If you have saved a DeepSeek API key, the assistant can search the web and read web pages through DeepSeek: the search terms and page addresses it chooses are sent to DeepSeek with your key. When you attach a scanned PDF that has no text, the app sends the file to DeepSeek with your key to recognise its text. DeepSeek processes this data under its own terms, and we don't receive it.

## 4. Plugins

Plugins run inside the app. Each plugin declares which hosts it may contact and which actions it may take, and you grant that access. Community plugins may send data to their own servers within the access you grant. The plugin's author is responsible for that handling. Read a plugin's description and requested access before you install it.

## 5. PKU harness Cloud (optional)

The cloud service at pkuharness.com/cloud is used only when you turn on a cloud feature, such as sharing a campus card payment code. You can switch it off or use your own server in **Settings → Cloud**.
- Your phone creates a key pair. The server sees only the public key, and uses it to recognise your device.
- Shared content is encrypted on your phone before it is sent. The key needed to read it is in the part of the share link after `#`, which browsers never send to the server. The server can't read payment codes or other shared content.
- The server stores encrypted data, its size, and expiry times. Share channels expire after at most 24 hours (15 minutes by default) and are deleted soon after. Stored items are deleted when they expire or when you delete them.
- The server uses your IP address in memory to limit abuse. Its logs record only the type of request, status and timing: no IP addresses, contents, links or tokens.

## 6. Updates and the website

- **New versions:** the app asks GitHub (api.github.com) for the latest release about twice a day, and downloads the APK from GitHub when you choose to update. GitHub sees your IP address and handles it under its own privacy statement.
- **Over-the-air updates:** the app downloads signed update files from pkuharness.com. These requests carry the app's version and platform and a random installation ID added by the update library. The server keeps no logs of them.
- **Website:** the website uses no tracking cookies or analytics. The download page asks GitHub for release information from our server, not from your browser.

## 7. Permissions the app asks for

- **Notifications, exact alarms and battery optimisation:** to deliver reminders on time.
- **Install apps:** to install updates you choose.
- **Accessibility service (Copilot only):** to read and operate the apps you allow during a Copilot task.
- **Camera, photos and files:** only when you choose to attach something.

You can withdraw any permission in Android settings.

## 8. Your rights

Because your data is stored on your phone, you can view, export and delete it in the app at any time. For data on our cloud service, delete it in the app, or contact us and we will help. Under the Personal Information Protection Law of the People's Republic of China, you may also ask us about how we handle your personal information.

## 9. Children

PKU harness is meant for members of Peking University. It is not designed for children under 14.

## 10. Changes to this policy

We may update this policy. The date at the top shows the current version, and the app tells you when there is a material change.

## 11. Contact

Questions or requests about privacy: open an issue at https://github.com/pkuinfo/pku-harness/issues, or for anything sensitive, report it privately as described in https://github.com/pkuinfo/pku-harness/security/policy.
