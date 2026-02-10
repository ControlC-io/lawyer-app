#!/bin/bash

# Script to clean and reinstall dependencies
echo "Cleaning up..."
rm -rf node_modules
rm -rf frontend/node_modules
rm -rf backend/node_modules
rm -rf shared/node_modules

echo "Installing dependencies..."
npm install

echo "Done!"
