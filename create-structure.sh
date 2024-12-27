#!/bin/bash

# 1. Create the main project folder
mkdir smoothfacture
cd smoothfacture

# 2. Initialize a new Node project (package.json)
npm init -y

# 3. Install React dependencies (React, React-DOM, and a PDF library like jsPDF)
npm install react react-dom jspdf

# 4. Create directories
mkdir public
mkdir src
mkdir src/components
mkdir src/pages
mkdir src/services
mkdir src/styles  # optional, for CSS files

# 5. Create placeholder files
touch public/index.html
touch src/index.js
touch src/App.js

touch src/components/InvoiceForm.jsx
touch src/components/InvoicePreview.jsx
touch src/components/NavigationBar.jsx

touch src/pages/Dashboard.jsx
touch src/pages/InvoiceCreation.jsx
touch src/pages/InvoicesList.jsx

touch src/services/parseEmail.js
touch src/services/pdfGenerator.js

# 6. Create a base README.md
cat <<EOT >> README.md
# smoothfacture

This is a React/JS project to transform raw email data into a PDF invoice.

## Getting Started

1. \`cd smoothfacture\`
2. \`npm install\` (already done by this script, but you can do it again if needed)
3. \`npm start\` (if using create-react-app, see below for instructions)

### Project Structure

- \`public/\`: contains the main \`index.html\`
- \`src/\`: main React code
- \`src/components/\`: reusable components
- \`src/pages/\`: page-level (route-level) components
- \`src/services/\`: utility functions (parsing, PDF generation, etc.)
- \`src/styles/\`: optional folder for CSS files

## Usage

- Paste your email text into the form on the \`InvoiceCreation\` page.
- Click "Parse Email" to auto-populate fields.
- Adjust/edit any data as needed.
- Click "Generate PDF" to download the invoice.

EOT

echo "Project structure created. Next steps:"
echo "1) Run 'chmod +x create-structure.sh' to make it executable."
echo "2) Then run './create-structure.sh' to create your folder structure and files."
echo "3) After that, open the 'smoothfacture' folder in your code editor and fill in the files with the code provided."

