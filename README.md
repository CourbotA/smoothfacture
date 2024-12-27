# smoothfacture

This is a React/JS project to transform raw email data into a PDF invoice.

## Getting Started

1. `cd smoothfacture`
2. `npm install` (already done by this script, but you can do it again if needed)
3. `npm start` (if using create-react-app, see below for instructions)

### Project Structure

- `public/`: contains the main `index.html`
- `src/`: main React code
- `src/components/`: reusable components
- `src/pages/`: page-level (route-level) components
- `src/services/`: utility functions (parsing, PDF generation, etc.)
- `src/styles/`: optional folder for CSS files

## Usage

- Paste your email text into the form on the `InvoiceCreation` page.
- Click "Parse Email" to auto-populate fields.
- Adjust/edit any data as needed.
- Click "Generate PDF" to download the invoice.

