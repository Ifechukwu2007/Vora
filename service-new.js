import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";

const params = new URLSearchParams(window.location.search);

const serviceId = params.get("id");

async function loadService() {

  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  displayService(data);
}

loadService();

function displayService(service) {

  const container = document.getElementById("service-container");

  container.innerHTML = `

    <div>

      <img
        src="${service.image}"
        class="w-full h-[450px] object-cover rounded-3xl mb-8"
      />

      <h1 class="text-4xl font-extrabold mb-4">
        ${service.title}
      </h1>

      <p class="text-gray-600 text-lg mb-6">
        ${service.description}
      </p>

      <div class="flex items-center justify-between">

        <div class="text-3xl font-bold text-blue-600">
          ₦${service.price}
        </div>

        <button
          class="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold">

          Book Now

        </button>

      </div>

    </div>

  `;
}