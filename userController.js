const bcrypt = require('bcrypt');
const User = require('./db');
const pool = require('./db');

exports.getUsername = async (userId) => {
    try {
        const user = await User.findById(userId);
        return user.username;
    } catch (error) {
        console.error('Kullanıcı adı alınamadı:', error);
        return null;
    }
};

exports.register = async (req, res) => {
    const { username, password, email } = req.body;
    let error = null; // Error değişkenini tanımlayın

    try {
        const existingUsername = await User.findOne({ username });
        const existingEmail = await User.findOne({ email });

        if (existingUsername && existingEmail) {
            error = 'Kullanıcı adı ve e-posta zaten kullanılıyor.';
        } else if (existingUsername) {
            error = 'Kullanıcı adı zaten kullanılıyor.';
        } else if (existingEmail) {
            error = 'E-posta zaten kullanılıyor.';
        }

        // Şifre doğrulama işlemleri
        if (!validatePassword(password)) {
            error = 'Password must contain at least one uppercase letter, one lowercase letter, one digit, one special character, and be at least 8 characters long.';
        }

        if (error) {
            return res.render('register', { error }); // Hata varsa doğrudan render edin
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({ username, password: hashedPassword, email });
        await user.save();
        res.redirect('/');
    } catch (error) {
        console.error('Kayıt hatası:', error);
        res.send('Kayıt sırasında bir hata oluştu.');
    }
};

exports.login = async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });

        if (!user) {
            return res.render('login', { usernameError: 'User not found.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.render('login', { error: 'Invalid password.' });
        }

        // Kullanıcı girişi başarılı ise session içine kullanıcı bilgilerini sakla
        req.session.user = {
            id: user._id,
            username: user.username
        };

        // Kullanıcı girişi başarılı ise home sayfasına yönlendir
        res.redirect('/home');
    } catch (error) {
        console.error('Giriş hatası:', error);
        res.send('Giriş sırasında bir hata oluştu.');
    }
};



// Şifre doğrulama fonksiyonu
function validatePassword(password) {
    const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W\_])[a-zA-Z0-9\W\_]{8,}$/;
    return passwordRegex.test(password);
}