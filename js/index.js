// Animaciones principales de la pagina web

document.addEventListener("DOMContentLoaded", ()=>{
    const elementos = document.querySelectorAll(".fade-in");
    const observador = new IntersectionObserver((entries)=>{
        entries.forEach(entry =>{
            if(entry.isIntersecting) {
                entry.target.classList.add("show");
            } else {
                entry.target.classList.remove("show");
            }
        });
    }, { threshold: 0.2 })
    elementos.forEach(el => observador.observe(el));
}); 

// Mostrar el header cuando no estemos en la primera vista

const header = document.querySelector("header");
const welcome = document.getElementById("welcome");
const observador = new IntersectionObserver((entries)=>{
    entries.forEach(entry => {
        if (entry.isIntersecting){
            header.classList.remove("visible");
        } else {
            header.classList.add("visible");
        }
    })
})

observador.observe(welcome);
    