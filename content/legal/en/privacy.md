<!--
  Source: specs/legal-privacy-draft.md (UX & PM), copied verbatim. Published text only; edit the
  spec first, then copy here. {pending:<id>}…{/pending} renders only when that
  condition is met (content/conditions.json, id with "-" for "_"). ⏳ and [VITOR]
  mark facts still to confirm: the page can't go live while any remain
  (src/lib/legalContent.test.ts).
-->
## Moodbow Privacy Policy
Last updated: 2 October 2026

Moodbow is a private journal made by Vitor Ribeiro Carvalho, trading as BurrowSoft (297 Moo 1, Baan Sanian, Mueang Nan, Nan 55000, Thailand), "we" in this policy. We wrote this to be read, not skimmed past. If anything is unclear, email support@moodbow.com.

### The short version
- Only you can read your journal. BurrowSoft staff don't read journals; direct database access is limited to maintenance by Vitor Ribeiro Carvalho. We don't sell your data, show ads, or use your journal to train AI.
- AI features are optional. If you turn them on, the parts of your journal needed for a reflection or report are sent to our AI provider, Anthropic, in the USA.
- You can export everything, or delete your account and everything in it, at any time, from the app or the website.

### 1. What we collect
**Your account:** your email address, your password (stored only as a secure hash), and when you agreed to our Terms and this policy, and confirmed you're 18 or older.
**Your journal:** the entries you write, your daily check-ins (mood, sleep, exercise, stress), the dates they belong to, and which entries you mark as moments.
**Your settings:** language, country, time zone, reminder time, {pending:appearance_setting}appearance, {/pending}and your AI choices (on or off, tone, focus areas).
**AI content (only if AI is on):** the reflections and reports the AI writes for you, {pending:ai_memory}and the short facts Moodbow remembers about you, which you can see, edit and delete in Me → What Moodbow remembers{/pending}.
**AI usage:** for each AI request, the feature, the model, the number of tokens, the cost and the credits used. Not the text of your entries or of the AI's answer.
{pending:purchases}**Purchases:** if you buy AI credits, Google Play or the App Store handles the payment. We receive a purchase reference and the number of credits, never your card details.{/pending}
**Crash reports:** if the app or website crashes, a technical report (device type, app or browser version, the error) is sent to our error-tracking provider. We remove personal details and any text you've written before it's sent, and the provider doesn't store your IP address.

**What stays only on your device:** unsent drafts{pending:app_lock}, your app-lock PIN{/pending}{pending:share_cards}, and the share cards you create. Share cards are made on your device and only leave it if you share them yourself{/pending}.

**Technical logs:** like almost every online service, our hosting providers record IP addresses and device or browser information when you connect, for security and to fix problems. They keep these logs for a limited time (see §4).

We don't collect your name, contacts, precise location, or advertising identifiers, and we don't use analytics or advertising trackers.

### 2. Why we use it, and on what legal basis
| Purpose | Legal basis |
|---|---|
| Running your account and your journal | Our contract with you (the Terms) |
| Processing your journal, which can reveal health and wellbeing information | Your explicit consent, given separately when you create your account (you can withdraw it by deleting your account) |
| AI reflections and reports | Your separate, explicit AI consent. You can withdraw it at any time in Me → AI |
| Keeping the service secure and fixing crashes | Our legitimate interest in a working, safe service |
| Answering your emails | Our legitimate interest, or our contract with you |

### 3. Who processes your data for us
| Provider | What for | Where |
|---|---|---|
| Supabase (on Amazon Web Services) | Database, accounts, file storage | Ireland (EU) |
| Anthropic | AI reflections and reports, only if AI is on | USA |
| Vercel | Hosting the website and web journal | USA and global edge network |
| Resend | Sending account emails (confirmation, password reset) | USA (company); emails are sent from Japan |
| Sentry | Crash reports, with personal details removed | USA |
{pending:purchases}| Google Play, Apple App Store | Payments for AI credits | Global |{/pending}

Each provider may use your data only to provide its service to us. Anthropic doesn't use data sent through its API to train its models, and it deletes it after a short period (at most 30 days) that it keeps for safety and abuse monitoring.
When data goes outside your country (for example from the EU to the USA), we rely on each provider's data-processing agreement and its data-transfer safeguards, such as the EU Standard Contractual Clauses or the EU–US Data Privacy Framework.

We never sell your data, and we never share it with advertisers.

### 4. How long we keep it
- Everything is kept until you delete it or delete your account.
- **Deleting your account** removes your journal, check-ins, AI content, settings, credits history and login from our live database immediately.
- Copies in our encrypted backups disappear automatically within {pending:backup_retention}7{/pending} days.
- Crash reports are kept by our error-tracking provider for up to 90 days.
- Technical logs at our providers (hosting, database, email delivery) are kept only for a limited period set by each provider, and then deleted.
- When you delete your account, copies in those providers' logs also expire under these retention periods.

### 5. Your rights
Wherever you live, you can:
- **see and download** everything: Me → Export my data;
- **correct** it: edit any entry, check-in or setting;
- **delete** it: delete any item, or your whole account in Me → Delete account;
- **withdraw your AI consent** at any time in Me → AI. This stops new AI requests; past reflections stay until you delete them;
- **object or ask questions**: email support@moodbow.com. We answer within 30 days.
You can also complain to a data-protection authority: in Thailand, the Personal Data Protection Committee (PDPC); in the EU or UK, your local authority.

### 6. Security
Your data is encrypted in transit (HTTPS) and at rest. Database rules make sure each account can only ever read its own rows. You can add an app lock (PIN or fingerprint/face) on your phone. No system is perfectly secure; if a breach ever affects your data, we'll tell you and the authorities as the law requires.

### 7. Age
Moodbow is for people aged 18 and older. We don't knowingly collect data from anyone younger. If you believe a child has an account, email us and we'll delete it.

### 8. Changes
If we change this policy in a way that matters, we'll update the date at the top and tell you in the app before the change applies.

### 9. Contact
Vitor Ribeiro Carvalho, trading as BurrowSoft, 297 Moo 1, Baan Sanian, Mueang Nan, Nan 55000, Thailand · support@moodbow.com
