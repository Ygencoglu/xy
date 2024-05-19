const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db');
const userController = require('./userController');
const session = require('express-session');
const tweetModel = require('./tweetModel');
const userModel = require('./db');
const app = express();
const Message = require('./messageModel');
const http = require('http');
const socketIo = require('socket.io');
const Redis = require('ioredis'); // Redis istemcisini ekleyin
const Comment = require('./commentModel'); // Comment model dosyasının yolunu doğru şekilde belirtmelisiniz
const Tweet = require('./tweetModel');

const server = http.createServer(app);
const io = socketIo(server);

// Redis istemcisini oluşturun ve bağlantıyı yapılandırın
const redisClient = new Redis();

// Tweetleri önbelleğe alacak bir fonksiyon tanımlayın
async function cacheTweets() {
    try {
        // MongoDB'den tüm tweetleri alın
        const tweets = await tweetModel.find().populate('author');

        // Tweetleri JSON formatına dönüştürün
        const tweetsJSON = JSON.stringify(tweets);

        // Redis'te tweetleri önbelleğe alın
        redisClient.setex('tweets', 3600, tweetsJSON); // 1 saat boyunca önbelleğe alın
        console.log('Tweetler Redis önbelleğine başarıyla eklendi.');

    } catch (error) {
        console.error('Tweetleri önbelleğe alma hatası:', error);
    }
}

// Tweetleri önbelleğe alma işlemini başlatın
cacheTweets();



const amqp = require('amqplib');

const rabbitMQUrl = 'amqp://localhost';

// RabbitMQ ile bağlantıyı oluşturmak için kullanılacak global değişken
let channel;

const connectToRabbitMQ = async () => {
    try {
        const connection = await amqp.connect(rabbitMQUrl);
        channel = await connection.createChannel();

        const queueName = 'tweetQueue';
        await channel.assertQueue(queueName, { durable: true });

        console.log('RabbitMQ ile bağlantı başarılı. Kuyruk oluşturuldu:', queueName);

        // Kuyruktan mesajları al ve işle
        channel.consume(queueName, async (msg) => {
            const tweetContent = JSON.parse(msg.content.toString());
            console.log('Tweet gönderme isteği alındı:', tweetContent);

            // Tweeti MongoDB'ye kaydet
            const newTweet = new tweetModel({
                content: tweetContent.tweet,
                author: tweetContent.userId
            });
            await newTweet.save();

            console.log('Tweet MongoDB\'ye başarıyla kaydedildi.');

            // Mesajı işleme tamamlandı olarak işaretle
            channel.ack(msg);
        });

    } catch (error) {
        console.error('RabbitMQ bağlantı hatası:', error);
    }
};


connectToRabbitMQ();

io.on('connection', socket => {
    socket.on('message', async data => {
        try {
            const { from, to, content } = data;

            // MongoDB'ye mesajı kaydet
            const newMessage = new Message({
                from: from,
                to: to,
                content: content
            });
            await newMessage.save();

            // Mesajı gönderen ve alıcıya ileti
            io.to(from).to(to).emit('message', { from, content });
        } catch (error) {
            console.error('Mesaj gönderme hatası:', error);
        }
    });
});


app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));


app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

app.get('/', (req, res) => {
    res.render('login');
});

app.get('/register', (req, res) => {
    res.render('register');
});
// Ana sayfa yolunu yönlendirme
app.get('/home', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const username = await userController.getUsername(userId);

        // Tweetleri MongoDB'den al ve ana sayfada göster
        const tweets = await tweetModel.find().populate({
            path: 'comments',
            populate: {
                path: 'author'
            }
        });

        res.render('home', { username, tweets });
    } catch (error) {
        console.error('Hata:', error.message);
        res.status(500).send(error.message);
    }
});


// Tweet gönderme işlemi
app.post('/tweet', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { tweet } = req.body;

        // Tweeti RabbitMQ kuyruğuna gönder
        const tweetContent = {
            userId,
            tweet
        };
        const queueName = 'tweetQueue';
        await channel.sendToQueue(queueName, Buffer.from(JSON.stringify(tweetContent)), { persistent: true });

        res.redirect('/home');
    } catch (error) {
        console.error('Tweet gönderme hatası:', error);
        res.status(500).send('Tweet gönderilirken bir hata oluştu.');
    }
});


// Beğeni işlemi için POST endpoint'i
app.post('/tweet/like', async (req, res) => {
    try {
        const tweetId = req.body.tweetId;

        // Tweetin beğeni sayısını MongoDB'de artır
        const updatedTweet = await tweetModel.findByIdAndUpdate(tweetId, { $inc: { likeCount: 1 } });

        res.status(200).json({ likeCount: updatedTweet.likeCount }); // Güncellenmiş beğeni sayısı
    } catch (error) {
        console.error('Beğeni hatası:', error);
        res.status(500).send('Beğeni yapılırken bir hata oluştu.');
    }
});



app.get('/login', (req, res) => {
    res.render('login'); // login.ejs dosyasını render et
});

app.get('/logout', (req, res) => {
    res.redirect('/login'); // Login sayfasına yönlendirme
});
app.post('/logout', (req, res) => {
    res.redirect('/login');
});

// GET isteği ile messages sayfasını gösterme
app.get('/messages', async (req, res) => {
    try {
        // MongoDB'den tüm kullanıcıları çek
        const users = await userModel.find({}, 'username');
        const messages = await Message.find();

        // Extract necessary data from req
        const userId = req.session.user.id;

        // messages.ejs sayfasına kullanıcıları ve oturum açmış kullanıcı adını geçir
        res.render('messages', { 
            userList: users, 
            messages: messages, 
            userId: userId,  // Pass userId to the template
            user: req.session.user // Pass the user object to the template
        });
    } catch (error) {
        console.error('Hata:', error.message);
        res.status(500).send(error.message);
    }
});



// POST isteği ile logout işlemi gerçekleştirme
app.post('/logout', (req, res) => {
    res.redirect('/login'); // Çıkış yapıldıktan sonra login sayfasına yönlendir
});

// Kullanıcı giriş işlemini gerçekleştirin
app.post('/login', userController.login);

// Kayıt işlemini gerçekleştirin
app.post('/register', userController.register);

const pool = require('./psql');

pool.connect((err, client, done) => {
  if (err) {
    console.error('PostgreSQL bağlantı hatası:', err);
  } else {
    console.log('PostgreSQL bağlantısı başarılı');
    // Bağlantıyı serbest bırak
    done();
  }
});

app.get('/user', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Kullanıcının bilgilerini PostgreSQL'den al
        const userResult = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
        const user = userResult.rows[0]; // İlk satırı al, çünkü kullanıcı yalnızca bir olmalı
        
        // Kullanıcının tweetlerini MongoDB'den al
        const tweets = await tweetModel.find({ author: userId });
        
        res.render('user', { 
            username: req.session.user.username, 
            user, 
            tweets 
        }); // about değişkenini de geçirin
    } catch (error) {
        console.error('Hata:', error.message);
        res.status(500).send(error.message);
    }
});


// POST isteği ile yeni kullanıcı ekleme veya mevcut kullanıcıyı güncelleme işlemi
app.post('/user', async (req, res) => {
    try {
        // Formdan gelen verileri al
        const { about, city, birthdate } = req.body;
        const userId = req.session.user.id;

        // Kullanıcının mevcut kaydını kontrol et
        const existingUser = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);

        if (existingUser.rows.length > 0) {
            // Kullanıcı zaten kayıtlıysa, bilgilerini güncelle
            const result = await pool.query(
                'UPDATE users SET about = $1, city = $2, birthdate = $3 WHERE user_id = $4',
                [about, city, birthdate, userId]
            );

            console.log('Kullanıcı bilgileri güncellendi:', result.rows[0]);
        } else {
            // Kullanıcı kayıtlı değilse, yeni bir kullanıcı ekle
            const result = await pool.query(
                'INSERT INTO users (user_id, about, city, birthdate) VALUES ($1, $2, $3, $4)', 
                [userId, about, city, birthdate]
            );

            console.log('Yeni kullanıcı eklendi:', result.rows[0]);
        }

        res.redirect('/user'); // Başarılı olursa kullanıcı sayfasına yönlendir
    } catch (error) {
        console.error('Kullanıcı eklerken veya güncellerken hata:', error);
        res.status(500).send('Kullanıcı eklerken veya güncellerken bir hata oluştu.');
    }
});



app.get('/search', async (req, res) => {
    try {
        const searchTerm = req.query.q;

        // İstenilen arama işlemini gerçekleştirin, örneğin kullanıcı isimlerini veya tweet içeriklerini kontrol edin.
        // Bu örnekte kullanıcı isimlerini arıyoruz, ancak ihtiyaca göre değiştirilebilir.
        const users = await userModel.find({ username: { $regex: searchTerm, $options: 'i' } }, 'username');

        // Sonuçları JSON formatında gönderin
        res.json(users.map(user => user.username));
    } catch (error) {
        console.error('Arama hatası:', error);
        res.status(500).send('Arama yapılırken bir hata oluştu.');
    }
});

// Örnek bir yorum ekleme endpoint'i
app.post('/tweet/:tweetId/comment', async (req, res) => {
    try {
        const tweetId = req.params.tweetId;
        const userId = req.session.user.id; // Varsayılan olarak oturum açmış kullanıcıyı alıyoruz, isteğe bağlı olarak farklı bir kimlik doğrulama yöntemi kullanabilirsiniz.
        const content = req.body.content;

        // Yeni bir yorum oluştur
        const newComment = new Comment({
            content: content,
            author: userId,
            tweet: tweetId
        });

        // Yorumu kaydet
        await newComment.save();

        // Yorumun tweet modeline eklenmesi
        const tweet = await Tweet.findById(tweetId);
        tweet.comments.push(newComment._id);
        tweet.commentCount += 1;
        await tweet.save();

        res.redirect('/home'); // Başarılı olursa ana sayfaya yönlendir
    } catch (error) {
        console.error('Yorum ekleme hatası:', error);
        res.status(500).send('Yorum eklenirken bir hata oluştu.');
    }
});




const PORT = 3000;

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor...`);
});