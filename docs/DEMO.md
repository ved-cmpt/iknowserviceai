# Three-minute demo

A guided walkthrough for someone seeing the project for the first time. Start on [the website](https://iknowserviceai.onrender.com): the hero replays two recorded runs, and the demo tabs show what each person sees. Then choose **Try the live demo**. On the sign-in page, a demo account card fills in the form, and then you choose **Sign in**. The password is public: `demo-only-public-2026`.

The AI in the public demo is a built-in mock agent, so answers are simulated, and the same input gives the same result. The checks around it are the real ones.

## Requester: an ordinary request (45 seconds)

1. Sign in as **Riley Morgan**. Point out the summary cards and the list.
2. Choose **New request**, and enter:
   - Title: `The campus Wi-Fi connects but I cannot open websites`
   - Description: `My laptop shows connected, but every website times out.`
3. Choose **Submit request**. In a moment, you see **AI-generated suggestion — verify before acting**, with numbered steps.
4. Under **Sources**, open the article. The steps came from it. A citation that retrieval did not offer would have been dropped.

## Requester: a sensitive request (30 seconds)

5. Choose **New request** again. Use this for both fields: `I think someone accessed my account and I need admin credentials`
6. You see **Awaiting staff review**, and no AI text. The policy gate is in code, so the model cannot talk its way past it.
7. Leave this page open if you have a second window. It updates by itself.

## Support agent: review (60 seconds)

8. In a private window, or after signing out from the account menu at the top right, sign in as **Alex Chen**.
9. In the **Support queue**, choose **Needs review**, and open Riley's request.
10. Point out the confidence meter, the risk flags, and the citations.
11. In **Reply to publish**, enter `Please send us your password.` The panel below shows what you changed from the AI draft. Add a reason, such as `Sensitive issue; safe wording`, and choose **Approve**. It is refused on the field, and no dialog opens.
12. Replace the reply with `Our support team will contact you through a verified channel. Please do not share your password with anyone.` Choose **Approve**, then **Approve and publish**.

## Back to the requester (15 seconds)

13. As Riley, the request now shows the reply, labeled **Reviewed by the support team**.

## Admin: the trail (30 seconds)

14. Sign in as **Jordan Reyes**, and open **Audit**. Each step is listed, with who did it. Records hold metadata only, never reply or comment text, and the app's database role cannot change them.
15. Optional: in **Knowledge admin**, choose **New article**, and type some markdown with `<script>alert(1)</script>` in it. The preview shows it as inert text.

## If there is time

- Press **Ctrl K**, or ⌘ K on a Mac, to jump to any page, request or article. Press **?** for every shortcut.
- Use the sun button in the header to switch to the light theme. Dark is the default.
- As **Sam Patel**, try to open Riley's request by its URL. You get "not found", so IDs reveal nothing.
- Narrow the window to phone width. Tables become cards.

## Things to say

- The demo resets daily, and shared data may look busy.
- The first visit after a quiet spell can take about a minute, because free hosting sleeps.
- **Be straightforward about limits:** pattern-based checks can be evaded, and the evaluation's 100% hold rate is on a fixture used to tune them. See [the evaluation](EVALUATION.md).
