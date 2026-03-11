const { MongoClient } = require('mongodb');
const {
  MONGODB_URI,
  DB_NAME,
  COLLECTION_NAME,
  SUBSCRIBERS_COLLECTION_NAME,
} = require('./config');

let mongoClient;
let transactionsCollection;
let subscribersCollection;

async function connectMongo() {
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db(DB_NAME);
  transactionsCollection = db.collection(COLLECTION_NAME);
  subscribersCollection = db.collection(SUBSCRIBERS_COLLECTION_NAME);
}

function getTransactionsCollection() {
  return transactionsCollection;
}

function getSubscribersCollection() {
  return subscribersCollection;
}

module.exports = {
  connectMongo,
  getTransactionsCollection,
  getSubscribersCollection,
};
