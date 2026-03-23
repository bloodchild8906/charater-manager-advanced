#!/bin/bash

# Custom deployment script for Azure App Service
# This ensures the scripts directory is preserved

echo "Custom deployment script starting..."

# Exit on any error
set -e

# Deployment source and target
DEPLOYMENT_SOURCE="${DEPLOYMENT_SOURCE:-$PWD}"
DEPLOYMENT_TARGET="${DEPLOYMENT_TARGET:-/home/site/wwwroot}"

echo "Deployment source: $DEPLOYMENT_SOURCE"
echo "Deployment target: $DEPLOYMENT_TARGET"

# Create target directory if it doesn't exist
mkdir -p "$DEPLOYMENT_TARGET"

# Copy application files
echo "Copying application files..."
cp -R "$DEPLOYMENT_SOURCE/app" "$DEPLOYMENT_TARGET/"
cp -R "$DEPLOYMENT_SOURCE/data" "$DEPLOYMENT_TARGET/"
cp "$DEPLOYMENT_SOURCE/package.json" "$DEPLOYMENT_TARGET/"
cp "$DEPLOYMENT_SOURCE/package-lock.json" "$DEPLOYMENT_TARGET/"

# Copy scripts directory (this is critical!)
echo "Copying scripts directory..."
mkdir -p "$DEPLOYMENT_TARGET/scripts"
cp "$DEPLOYMENT_SOURCE/scripts/sqliteAppBaseSchema.cjs" "$DEPLOYMENT_TARGET/scripts/"
if [ -d "$DEPLOYMENT_SOURCE/scripts/built" ]; then
  cp -R "$DEPLOYMENT_SOURCE/scripts/built" "$DEPLOYMENT_TARGET/scripts/"
fi

# Copy public directory if it exists
if [ -d "$DEPLOYMENT_SOURCE/public" ]; then
  echo "Copying public directory..."
  cp -R "$DEPLOYMENT_SOURCE/public" "$DEPLOYMENT_TARGET/"
fi

# Install dependencies
echo "Installing dependencies..."
cd "$DEPLOYMENT_TARGET"
npm ci --production --prefer-offline

echo "Deployment complete!"
