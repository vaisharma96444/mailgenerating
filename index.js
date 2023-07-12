const express = require('express');
const app = express();
const port = 8000;
const path = require('path');
const fs = require('fs').promises;
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.metadata',
  'https://www.googleapis.com/auth/gmail.modify',
];




app.get('/', async (req, res) => {
  try {
    const credentials = await fs.readFile('credentials.json');
    const auth = await authenticate({
      keyfilePath: path.join(__dirname, 'credentials.json'),
      scopes: SCOPES,
    });

    console.log('Authentication successful');

    const gmail = google.gmail({ version: 'v1', auth });

    const LABEL_NAME = 'vacation';




    async function getUnrepliedMessages(auth) {
      const gmail = google.gmail({ version: 'v1', auth });
      const res = await gmail.users.messages.list({
        userId: 'me',
      //  q: '-in:chats -from:me -label:vacation',
      });
      return res.data.messages || [];
    }




    async function sendReply(auth, message) {
      const gmail = google.gmail({ version: 'v1', auth });
      const res = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'metadata',
        metadataHeaders: ['subject', 'from'],
      });



      const subject = res.data.payload.headers.find((header) => header.name === 'Subject').value;
      const from = res.data.payload.headers.find((header) => header.name === 'From').value;

      const replyTo = from && from.match(/<(.*)>/)[1];
      const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
      const replyBody = `Hi,\n\nI'm currently on vacation and will get back to you soon. Sorry for the delay.\n\nRegards,\nVaibhav Sharma`;
      //reply body 
      const rawMessage = [
        `From: me`,
        `To: ${replyTo}`,
        `Subject: ${replySubject}`,
        `In-Reply-To: ${message.id}`,
        `References: ${message.id}`,
        '',
        replyBody,
      ].join('\n');


      const encodedMessage = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
     
     //gmail api
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });
    }

    async function createLabel(auth) {
      const gmail = google.gmail({ version: 'v1', auth });
      try {
        const res = await gmail.users.labels.create({
          userId: 'me',
          requestBody: {
            name: LABEL_NAME,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          },
        });
        return res.data.id;
      } catch (err) {
        if (err.code === 409) {
          const res = await gmail.users.labels.list({
            userId: 'me',
          });
          const label = res.data.labels.find((label) => label.name === LABEL_NAME);
          return label.id;
        } else {
          throw err;
        }
      }
    }

    async function addLabel(auth, message, labelId) {
      const gmail = google.gmail({ version: 'v1', auth });
      await gmail.users.messages.modify({
        userId: 'me',
        id: message.id,
        requestBody: {
          addLabelIds: [labelId],
          removeLabelIds: ['INBOX'],
        },
      });
    }

    async function main() {
      const labelId = await createLabel(auth);
      console.log(`Created or found label with id ${labelId}`);

      // Repeat the following steps
      setInterval(async () => {
        // Get messages with no reply
        const messages = await getUnrepliedMessages(auth);
        console.log(`Found ${messages.length} unreplied messages`);

        for (const message of messages) {
          await sendReply(auth, message);
          console.log(`Sent reply to message with id ${message.id}`);

          // Add label and move to label
          await addLabel(auth, message, labelId);
          console.log(`Added label to message with id ${message.id}`);
        }
      }, Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000);
    }

    main().catch((err) => {
      console.error('An error occurred:', err);
      res.send('An error occurred. Please check the server logs for details.');
    });

    res.send('You have successfully subscribed.');
  } catch (err) {
    console.error('An error occurred:', err);
    res.send('An error occurred. Please check the server logs for details.');
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
