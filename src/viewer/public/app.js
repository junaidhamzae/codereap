console.log('Hello Viewer');
const input = document.getElementById('fileInput');
if (input) {
  input.addEventListener('change', () => {
    console.log('File selected');
  });
}


