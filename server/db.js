const mongoose = require('mongoose');

const connectDb = async () => {
  if (mongoose.connection.readyState >= 1) return;
  if (!process.env.MONGO_URI) throw new Error('Missing MONGO_URI');
  await mongoose.connect(process.env.MONGO_URI);
};

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: String, required: true }
});

const GroupSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  createdAt: { type: String, required: true }
});

const ParticipantSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  color: { type: String },
  avatar: { type: String },
  isPrimary: { type: Boolean, default: false },
  userId: { type: mongoose.Schema.Types.ObjectId },
  createdAt: { type: String, required: true }
});

const SplitSchema = new mongoose.Schema({
  participantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  amountCents: { type: Number, required: true },
  percentage: { type: Number }
}, { _id: false });

const ExpenseSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, required: true },
  payerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  amountCents: { type: Number, required: true },
  description: { type: String, required: true },
  expenseDate: { type: String, required: true },
  splitMode: { type: String, required: true },
  splits: { type: [SplitSchema], default: [] },
  createdAt: { type: String, required: true }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Group = mongoose.models.Group || mongoose.model('Group', GroupSchema);
const Participant = mongoose.models.Participant || mongoose.model('Participant', ParticipantSchema);
const Expense = mongoose.models.Expense || mongoose.model('Expense', ExpenseSchema);

const toId = (doc) => {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.id = String(obj._id);
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = { connectDb, User, Group, Participant, Expense, toId };
