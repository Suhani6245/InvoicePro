const mongoose = require('mongoose');

/**
 * Connects to MongoDB Atlas using the URI provided in environment variables.
 * Exits the process on failure so Render / process managers can restart it.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Modern mongoose (8.x) no longer needs useNewUrlParser/useUnifiedTopology
      // but they are harmless if left out. Kept minimal on purpose.
    });

    console.log(`[DB] MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error(`[DB] Connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[DB] MongoDB disconnected');
    });

    return conn;
  } catch (error) {
    console.error(`[DB] Failed to connect to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
