const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB bağlantı hatası:'));
db.once('open', () => {
    console.log('MongoDB ile bağlantı başarılı.');
});

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    email: { type: String, unique: true }
});

// UserModel oluşturuluyor
const UserModel = mongoose.model('User', userSchema);

module.exports = UserModel; // UserModel export ediliyor
