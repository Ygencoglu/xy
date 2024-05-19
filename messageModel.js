const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Gönderen
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Alıcı
    content: String,
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
