import sys
import subprocess
import os

def install_requirements():
    """
    Helper script to install all backend dependencies from requirements.txt
    """
    requirements_path = os.path.join(os.path.dirname(__file__), "requirements.txt")
    
    if not os.path.exists(requirements_path):
        print(f"Error: {requirements_path} not found.")
        sys.exit(1)

    print("--- BOX-ing Backend Dependency Installer ---")
    print(f"Installing dependencies from {requirements_path}...")

    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", requirements_path])
        print("\nSUCCESS: All dependencies installed correctly.")
    except subprocess.CalledProcessError as e:
        print(f"\nERROR: Failed to install dependencies. Exit code: {e.returncode}")
        sys.exit(1)
    except Exception as e:
        print(f"\nAN UNEXPECTED ERROR OCCURRED: {e}")
        sys.exit(1)

if __name__ == "__main__":
    install_requirements()
