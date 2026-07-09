async function test() {
  const res = await fetch('http://localhost:4321/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test' })
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body:', text);
}
test();
