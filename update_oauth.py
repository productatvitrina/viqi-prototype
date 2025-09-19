#!/usr/bin/env python3
"""
Script to update Google OAuth credentials in ViQi prototype
"""
import os
import sys

def update_env_file(client_id, client_secret):
    """Update the .env.local file with Google OAuth credentials."""
    
    env_file = "/Users/User/Pythonproject/viqi-prototype/apps/web/.env.local"
    
    try:
        # Read current content
        with open(env_file, 'r') as f:
            content = f.read()
        
        # Replace the placeholder values
        content = content.replace(
            'GOOGLE_CLIENT_ID=your-google-client-id-here',
            f'GOOGLE_CLIENT_ID={client_id}'
        )
        content = content.replace(
            'GOOGLE_CLIENT_SECRET=your-google-client-secret-here', 
            f'GOOGLE_CLIENT_SECRET={client_secret}'
        )
        
        # Write back
        with open(env_file, 'w') as f:
            f.write(content)
            
        print(f"✅ Updated {env_file}")
        print(f"✅ Google Client ID: {client_id[:20]}...")
        print(f"✅ Google Client Secret: {client_secret[:10]}...")
        print("\n🚀 Ready to test! Restart your Next.js server and try the OAuth flow.")
        
    except Exception as e:
        print(f"❌ Error updating .env.local: {e}")
        return False
    
    return True

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python update_oauth.py <CLIENT_ID> <CLIENT_SECRET>")
        sys.exit(1)
    
    client_id = sys.argv[1]
    client_secret = sys.argv[2]
    
    if not client_id.endswith('.apps.googleusercontent.com'):
        print("⚠️  Warning: Client ID doesn't look like a Google OAuth Client ID")
    
    if not client_secret.startswith('GOCSPX-'):
        print("⚠️  Warning: Client Secret doesn't look like a Google OAuth Secret")
    
    update_env_file(client_id, client_secret)
