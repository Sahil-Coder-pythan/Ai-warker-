# Cloudflare R2 setup status (Hindi)

इस ZIP में होम स्क्रीन के category tiles को cartoon SVG की जगह photo assets से बदला गया है और दुकान वालों के लिए motivational line को hero area में ऊपर रखा गया है।

## जरूरी बात
यह build अभी Cloudflare R2 पर product uploads भेजने के लिए integrated नहीं है। मौजूदा product upload flow images को app/database store layer में भेजता है। केवल Render Environment में R2 की keys डाल देने से uploads अपने-आप R2 में नहीं जाएंगे। इस ZIP को R2-ready बताना गलत होगा।

R2 integration के लिए backend upload और product image read/serve flow को update करना, image URLs/keys persist करना, existing image records compatibility संभालना, और upload/delete/edit routes test करना आवश्यक है।

## R2 credentials (जब code integration पूरी हो)
Render Environment में आम तौर पर अलग-अलग variables चाहिए होंगे:
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL` (अगर public custom domain/CDN configure किया हो)

Secret values केवल Render dashboard में डालें; chat, GitHub या ZIP में न डालें। Neon का `DATABASE_URL` अलग ही रहेगा। R2, PostgreSQL database नहीं बल्कि object/file storage है।
