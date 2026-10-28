# किसी भी होस्ट पर चलाने के स्टेप (Render / Railway / कोई भी)

कोड में अब किसी खास होस्ट पर निर्भरता नहीं है। `Procfile` और `npm start` से हर जगह चलता है।

## आम स्टेप (हर होस्ट पर वही)
1. GitHub रेपो को होस्ट से जोड़ें (Deploy from GitHub)।
2. Environment / Variables सेक्शन में `.env.example` की सारी वैल्यू भरें।
   - DATABASE_URL वही रखें जो अभी है (तभी प्रोडक्ट, QR, ऑर्डर, चैट बचेंगे)।
   - NODE_ENV=production ज़रूर डालें (Render पर अपने आप चलता है, बाकी जगह नहीं)।
3. डिप्लॉय के बाद मिले नए लिंक को APP_URL में डालें और
   GOOGLE_REDIRECT_URI = नया लिंक + /shop/api/google/callback
4. Google Cloud Console -> Credentials -> OAuth Client -> Authorized redirect URIs में वही callback लिंक जोड़ें।
5. Start command: `npm start` (अपने आप पता चलता है)।

## Render पर वही सर्विस
Settings -> Instance Type में पेड प्लान लेने पर लिंक और Environment वही रहते हैं।

## चैट
चैट के लिए कोई key नहीं चाहिए। CHAT_ENABLED=true (डिफ़ॉल्ट) रहे तो चालू है।
- मैसेज DATABASE_URL वाले डेटाबेस में हमेशा के लिए सेव होते हैं।
- नए मैसेज तुरंत दिखते हैं (Server-Sent Events)।
- DATABASE_URL न हो तो चैट लोकल फाइल में चलता है, जो रीस्टार्ट पर मिट सकती है।
