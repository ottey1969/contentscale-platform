#!/bin/bash

echo "🚀 ContentScale Platform - Quick Setup"
echo "======================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found!"
    echo ""
    echo "Please create .env file with your Neon connection string:"
    echo ""
    echo "DATABASE_URL=postgresql://your-neon-connection-string"
    echo "PORT=3000"
    echo "NODE_ENV=development"
    echo ""
    read -p "Press Enter when .env is ready..."
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Test database connection
echo ""
echo "🔍 Testing database connection..."
node -e "
const pool = require('./db/postgres');
pool.query('SELECT NOW()')
  .then(() => {
    console.log('✅ Database connected successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    console.log('');
    console.log('Make sure your DATABASE_URL in .env is correct.');
    process.exit(1);
  });
"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Run database schema: psql \$DATABASE_URL < db/schema.sql"
    echo "2. Get your admin key: SELECT admin_api_key FROM security_config;"
    echo "3. Start server: npm start"
    echo ""
    echo "The platform will be available at http://localhost:3000"
else
    echo ""
    echo "❌ Setup failed. Please fix the database connection and try again."
    exit 1
fi
