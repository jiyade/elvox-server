const escapeCsvValue = (value = "") => String(value).replace(/"/g, '""')

export default escapeCsvValue
