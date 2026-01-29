#!/bin/bash

echo "========================================"
echo "  Visa Application Helper - Setup"
echo "========================================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please download and install Node.js from https://nodejs.org/"
    exit 1
fi

echo "Node.js found: $(node --version)"
echo ""

echo "Installing dependencies (this may take a few minutes)..."
npm install

if [ $? -ne 0 ]; then
    echo "ERROR: npm install failed!"
    exit 1
fi

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "To start the application, run:"
echo "  npm start"
echo ""
echo "To start in development mode with DevTools:"
echo "  npm run dev"
echo ""
