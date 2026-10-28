# Stratic Market — लॉन्च से पहले स्थिरता और डेटा-सुरक्षा जाँच

यह बदलाव मौजूदा ऐप को दोबारा लिखे बिना किया गया है। डिज़ाइन, प्रोडक्ट/ऑर्डर नियम, पहचान प्रणाली या ब्रांडिंग को जानबूझकर नहीं बदला गया।

## इस पास में किए गए सुधार

- मोबाइल पर एक बार में अधिकतम 40 प्रोडक्ट कार्ड DOM में दिखते हैं। ज्यादा प्रोडक्ट होने पर “Show more products” से अगला हिस्सा दिखता है; इससे हजारों कार्ड एक साथ स्क्रीन में बनने से बचते हैं।
- स्टार्टअप अब डेटाबेस restore के लिए 15 सेकंड की race करके सर्वर को बीच में शुरू नहीं करता। restore पूरा होने के बाद ही सर्वर शुरू होगा, ताकि देर से आया restore नए स्थानीय बदलावों को overwrite न करे।
- Render पर `DATABASE_URL` न होने पर ऐप अब customer data स्वीकार करने के बजाय startup रोकता है। Render का अस्थायी filesystem स्थायी डेटा स्टोरेज नहीं है।
- Neon/वैकल्पिक फोटो डेटाबेस की queued writes के failures अब चुपचाप छिपाए नहीं जाते। सफल write API response भेजने से पहले queued database writes की पुष्टि होती है; पुष्टि न हो तो API error देता है और client को blindly retry न करने की चेतावनी देता है।
- GetPronto पर फोटो upload की पुष्टि और URL mapping सेव होने तक database में फोटो की fallback copy रखी जाती है। पुष्टि के बाद redundant copy हटाने की queue होती है। यदि वैकल्पिक फोटो DB फेल हो, तो primary database fallback आज़माया जाता है।
- प्रोडक्ट listing बनाने के बाद cloud persistence की पुष्टि की जाती है; पुष्टि न हो तो ग्राहक को यह बताया जाता है कि listing स्थानीय रूप से बनी हो सकती है और दोबारा upload करने से पहले जाँच करनी चाहिए।

## जाँच के परिणाम

- `node --check` सफल: `src/server.js`, `src/services/shop-store.js`, `src/routes/shop.js`, `src/public/js/shop.js`।
- `npm test` सफल नहीं हुआ: ZIP में कई test files ऐसे service modules को import करती हैं जो `src/` में मौजूद नहीं हैं (उदाहरण: `address-service`, `ai-guardrails-service`, `booking-confirmation-policy`)। इसलिए automated regression test suite अभी पूरी नहीं है।
- इस वातावरण में live Neon, Render, GetPronto, छोटे Android फोन, 5,000 products या concurrent users का load test नहीं किया गया।

## लॉन्च से पहले अनिवार्य बातें

1. Render Environment में सही `DATABASE_URL` लगाएँ; startup logs में database restore सफल होना चाहिए।
2. एक test seller से product upload करें, 5–6 photos लगाएँ, फिर Render redeploy/restart के बाद product और सभी photos जाँचें।
3. test order बनाएँ; buyer और seller दोनों तरफ order, status, address और product photo जाँचें।
4. 5,000 test products के साथ listing, search, category, cart और checkout जाँचें।
5. GetPronto dashboard में uploads और quota जाँचें।
6. पहले सीमित/staging launch करें; सफल परीक्षण के बाद ही सार्वजनिक लॉन्च करें।

## महत्वपूर्ण सीमा

कोई भी ऐप “डेटा कभी भी नहीं खोएगा” की पूर्ण गारंटी नहीं दे सकता। यह patch जोखिम घटाता है और कुछ persistence failures को सामने लाता है, लेकिन database backups/restore drill, live provider tests, concurrency tests और अधूरे test modules ठीक किए बिना Meesho-जैसी स्केल या zero-data-loss की पुष्टि नहीं की जा सकती।
