# Google Sheet Sync Setup

1. Create a Google Sheet for the tournament.
2. Open `Extensions > Apps Script`.
3. Replace the default script with the contents of `google-apps-script.gs`.
4. Click `Deploy > New deployment`.
5. Choose `Web app`.
6. Set `Execute as` to `Me`.
7. Set `Who has access` to `Anyone`.
8. Deploy and copy the Web app URL.
9. Open the pickleball site and paste that URL into `Google Sheet sync URL`.
10. Enter scores. Other devices can press `Load scores` after refresh to see the latest.

The web app only stores match score keys and score values in the `Scores` tab.
