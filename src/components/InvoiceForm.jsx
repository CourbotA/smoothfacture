import React from 'react';

function InvoiceForm({ invoiceData, setInvoiceData }) {
  if (!invoiceData) return null;

  const { clientName, clientAddress, interventionDate, items } = invoiceData;

  // Update top-level fields (e.g., clientName)
  const handleChange = (field, value) => {
    setInvoiceData({
      ...invoiceData,
      [field]: value,
    });
  };

  // Update an item’s description or price
  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      [field]: value,
    };
    setInvoiceData({ ...invoiceData, items: newItems });
  };

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '1rem',
        border: '1px solid #ccc',
        maxWidth: '600px',
      }}
    >
      <h3>Edit Invoice Data</h3>

      <div style={{ marginBottom: '0.5rem' }}>
        <label>Client Name: </label>
        <input
          type="text"
          value={clientName}
          onChange={(e) => handleChange('clientName', e.target.value)}
        />
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label>Client Address: </label>
        <input
          type="text"
          value={clientAddress}
          onChange={(e) => handleChange('clientAddress', e.target.value)}
        />
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label>Intervention Date: </label>
        <input
          type="text"
          value={interventionDate}
          onChange={(e) => handleChange('interventionDate', e.target.value)}
        />
      </div>

      <h4>Items</h4>
      {items && items.map((item, idx) => (
        <div key={idx} style={{ marginBottom: '0.5rem' }}>
          <input
            type="text"
            style={{ width: '50%' }}
            value={item.description}
            onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
          />
          <input
            type="number"
            style={{ marginLeft: '1rem', width: '80px' }}
            value={item.price}
            onChange={(e) =>
              handleItemChange(idx, 'price', parseFloat(e.target.value) || 0)
            }
          />{' '}
          €
        </div>
      ))}
    </div>
  );
}

export default InvoiceForm;
