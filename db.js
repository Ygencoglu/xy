const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/xy', {
})
.then(() => console.log('MongoDB bağlantısı başarılı'))
.catch(err => console.error('MongoDB bağlantı hatası:', err));

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    email: { type: String, unique: true }
});

// UserModel oluşturuluyor
const UserModel = mongoose.model('User', userSchema);

module.exports = UserModel; // UserModel export ediliyor
