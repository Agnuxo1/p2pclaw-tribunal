// Machine-readable stdout for the stock runScript CLI; execution is unchanged.
console.log = (...values) => {
  process.stdout.write(values.map(value =>
    typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
  ).join(' ') + '\n');
};
