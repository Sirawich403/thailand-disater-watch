fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: "ทดสอบ", history: [] })
})
    .then(res => res.text().then(text => console.log('HTTP', res.status, text)))
    .catch(err => console.error(err));
