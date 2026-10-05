document.addEventListener('DOMContentLoaded', () => {
    const treeContainer = document.getElementById('treeContainer');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userProfile = document.getElementById('userProfile');
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    const actionButtons = document.getElementById('actionButtons');
    
    // Modals
    const eventModal = document.getElementById('eventModal');
    const mediaModal = document.getElementById('mediaModal');
    
    const addEventBtn = document.getElementById('addEventBtn');
    const closeEventModal = document.getElementById('closeEventModal');
    const closeMediaModal = document.getElementById('closeMediaModal');
    
    const addEventForm = document.getElementById('addEventForm');
    const addMediaForm = document.getElementById('addMediaForm');
    
    // Initialize Flatpickr for beautiful date selection
    const dateInput = document.getElementById('date');
    if (dateInput) {
        flatpickr(dateInput, {
            minDate: "1947-01-01",
            maxDate: "today",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "F j, Y",
            disableMobile: "true" // forces the pretty UI on mobile too
        });
    }

    let isDriveConnected = false;
    let globalEvents = [];

    // Check Auth Status
    async function checkDriveStatus() {
        try {
            const res = await fetch('/api/auth/status');
            const data = await res.json();
            
            const authSectionCenter = document.getElementById('authSectionCenter');
            if (data.connected && data.user) {
                if(authSectionCenter) authSectionCenter.style.display = 'none';
                loginBtn.style.display = 'none';
                userProfile.style.display = 'block';
                userName.textContent = data.user.name;
                userAvatar.src = data.user.picture;
                actionButtons.style.display = 'flex';
                document.getElementById('viewToggle').style.display = 'flex';
                isDriveConnected = true;
                loadEvents();
            } else {
                if(authSectionCenter) authSectionCenter.style.display = 'block';
                loginBtn.style.display = 'inline-block';
                userProfile.style.display = 'none';
                actionButtons.style.display = 'none';
                document.getElementById('viewToggle').style.display = 'none';
                
                yearsView.innerHTML = '<p style="text-align:center; width:100%; margin-top:20px;">Please sign in to view and upload your life journey.</p>';
            }
        } catch(e) {
            console.error("Failed to check auth status");
        }
    }

    loginBtn.onclick = async () => {
        try {
            const res = await fetch('/api/auth/url');
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (e) {
            alert('Failed to get Google login URL');
        }
    };

    logoutBtn.onclick = async () => {
        if (confirm("Are you sure you want to log out?")) {
            await fetch('/api/auth/logout');
            window.location.reload();
        }
    };

    const yearsView = document.getElementById('yearsView');
    const tripsView = document.getElementById('tripsView');
    const tripsGrid = document.getElementById('tripsGrid');
    const backToYearsBtn = document.getElementById('backToYearsBtn');
    const currentYearTitle = document.getElementById('currentYearTitle');

    // Fetch and render events
    async function loadEvents() {
        try {
            const response = await fetch('/api/events');
            globalEvents = await response.json();
            window.globalEvents = globalEvents;
            
            // Sort events chronologically by default
            globalEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            renderYears(globalEvents);
            if(window.updateStatsDashboard) window.updateStatsDashboard();

            // Sync active Trips View
            if (tripsView.style.display === 'block') {
                const yearMatch = currentYearTitle.textContent.match(/^(\d{4})/);
                if (yearMatch) {
                    const yearStr = yearMatch[1];
                    const remainingTrips = globalEvents.filter(e => new Date(e.date).getFullYear().toString() === yearStr);
                    if (remainingTrips.length === 0) {
                        backToYearsBtn.click();
                    } else {
                        showTripsForYear(yearStr, remainingTrips);
                    }
                }
            }

            // Sync active Gallery View
            if (galleryModal.style.display === 'block') {
                const galleryTitleEl = document.getElementById('galleryModalTitle').textContent;
                // find the event whose title is in the gallery modal title
                const event = globalEvents.find(e => galleryTitleEl.includes(e.title));
                if (event) {
                    openGalleryModal(event.id, event.title);
                } else {
                    galleryModal.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Error fetching events:', error);
            yearsView.innerHTML = '<p style="text-align:center; width: 100%;">Failed to load events. Is the server running?</p>';
        }
    }

    function renderYears(events) {
        yearsView.innerHTML = '';
        yearsView.className = 'map-wrapper';
        
        // Group by Calendar Year
        const grouped = {};
        events.forEach(ev => {
            const dateObj = new Date(ev.date);
            const calendarYear = dateObj.getFullYear();
            if (!grouped[calendarYear]) grouped[calendarYear] = [];
            grouped[calendarYear].push(ev);
        });

        // Determine year range and only include years that have trips
        const currentYear = new Date().getFullYear();
        let dbYears = Object.keys(grouped).map(Number);
        
        // Sort descending (newest year at the top)
        dbYears.sort((a, b) => b - a);
        
        const yearsArray = dbYears;

        if (yearsArray.length === 0) {
            yearsView.innerHTML = '<p style="text-align:center; width:100%; margin-top:20px;">No trips added yet. Add a new trip to see the map!</p>';
            return;
        }

        const nodeSpacingY = 180; // vertical pixels between nodes
        const containerHeight = yearsArray.length * nodeSpacingY + 100;
        
        const mapContainer = document.createElement('div');
        mapContainer.className = 'map-container';
        mapContainer.style.height = `${containerHeight}px`;

        // SVG Path setup
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'map-path-svg');
        svg.setAttribute('viewBox', `0 0 100 ${containerHeight}`);
        svg.setAttribute('preserveAspectRatio', 'none');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'map-path-line');
        
        const nodesContainer = document.createElement('div');
        nodesContainer.className = 'map-nodes-container';
        
        let pathD = '';

        yearsArray.forEach((year, index) => {
            const tripCount = grouped[year] ? grouped[year].length : 0;
            
            // Calculate Position
            const yPos = 80 + index * nodeSpacingY;
            // X position using a sine wave, oscillating between 20% and 80% width
            const xOffset = Math.sin(index * 1.5) * 30; // 30 is amplitude
            const xPosPercent = 50 + xOffset;
            
            // Draw Path connecting nodes
            if (index === 0) {
                pathD += `M ${xPosPercent} ${yPos} `;
            } else {
                const prevY = 80 + (index - 1) * nodeSpacingY;
                const prevXOffset = Math.sin((index - 1) * 1.5) * 30;
                const prevXPercent = 50 + prevXOffset;
                
                // Control points for a smooth cubic bezier curve
                const cp1X = prevXPercent;
                const cp1Y = prevY + (nodeSpacingY / 2);
                const cp2X = xPosPercent;
                const cp2Y = yPos - (nodeSpacingY / 2);
                
                pathD += `C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${xPosPercent} ${yPos} `;
            }

            // Create HTML Node
            const node = document.createElement('div');
            node.className = `map-node ${year === currentYear ? 'current-year' : 'past-year'}`;
            if (tripCount === 0 && year !== currentYear) {
                node.classList.add('empty-year');
            }
            node.style.top = `${yPos}px`;
            node.style.left = `${xPosPercent}%`;
            
            node.innerHTML = `
                <div class="map-node-label">${year}</div>
                ${tripCount > 0 ? `<div class="map-node-sublabel">${tripCount} Trips</div>` : ''}
            `;
            
            let pressTimer;
            let isLongPress = false;
            
            const startPress = (e) => {
                isLongPress = false;
                pressTimer = window.setTimeout(() => {
                    isLongPress = true;
                    if (confirm(`Are you sure you want to delete ALL trips for the year ${year}? This cannot be undone.`)) {
                        fetch(`/api/events/year/${year}`, { method: 'DELETE' })
                            .then(res => res.json())
                            .then(data => {
                                if (data.success) loadEvents();
                                else alert('Error deleting year: ' + data.error);
                            });
                    }
                }, 800);
            };
            
            const cancelPress = () => clearTimeout(pressTimer);
            
            node.onmousedown = startPress;
            node.onmouseup = cancelPress;
            node.onmouseleave = cancelPress;
            node.ontouchstart = startPress;
            node.ontouchend = cancelPress;
            node.ontouchcancel = cancelPress;
            node.ontouchmove = cancelPress;

            node.onclick = (e) => {
                if (isLongPress) {
                    e.preventDefault();
                    return;
                }
                if (tripCount > 0) {
                    showTripsForYear(year, grouped[year]);
                } else {
                    alert(`No trips tracked for ${year} yet.`);
                }
            };
            
            nodesContainer.appendChild(node);
        });

        path.setAttribute('d', pathD);
        svg.appendChild(path);
        
        mapContainer.appendChild(svg);
        mapContainer.appendChild(nodesContainer);
        yearsView.appendChild(mapContainer);
    }

    window.deleteTrip = (tripId, yearStr) => {
        if (confirm("Are you sure you want to permanently delete this trip and all its photos?")) {
            fetch(`/api/events/${tripId}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        loadEvents(); // Reload all data and let the new loadEvents sync UI
                    } else {
                        alert("Error: " + data.error);
                    }
                });
        }
    };

    function showTripsForYear(year, events) {
        currentYearTitle.textContent = `${year} Trips & Memories`;
        tripsGrid.innerHTML = '';
        
        events.forEach(event => {
            const dateObj = new Date(event.date);
            const formattedDate = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'long' }); // Omit year since it's implied
            
            const card = document.createElement('div');
            card.className = 'trip-card';
            
            // Background
            let bgStyle = '';
            if (event.media && event.media.length > 0) {
                const firstImage = event.media.find(m => m.type === 'image');
                if (firstImage) {
                    bgStyle = `background-image: url('${firstImage.url}');`;
                } else {
                    bgStyle = `background: linear-gradient(45deg, rgba(255,107,107,0.5), rgba(78,205,196,0.5));`;
                }
            }

            card.innerHTML = `
                <button class="delete-trip-btn" onclick="deleteTrip('${event.id}', '${year}')" title="Delete Trip"><i class="fas fa-trash"></i></button>
                <div class="card-bg" style="${bgStyle}"></div>
                <div class="card-content" style="flex: 1; display: flex; flex-direction: column;">
                    <div class="card-date">${formattedDate}</div>
                    <h3 class="card-title">${event.title}</h3>
                    <p class="card-desc" style="flex: 1;">${event.description || ''}</p>
                    <div class="card-actions">
                        <button class="action-btn view-media-btn" data-id="${event.id}" data-title="${event.title}">
                            <i class="fas fa-images"></i> View Images (${event.media ? event.media.length : 0})
                        </button>
                        <button class="action-btn add-media-btn" data-id="${event.id}" data-title="${event.title}">
                            <i class="fas fa-upload"></i> Upload
                        </button>
                    </div>
                </div>
            `;
            tripsGrid.appendChild(card);
        });

        // Attach event listeners to new buttons
        document.querySelectorAll('.add-media-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!isDriveConnected) {
                    alert("Please click 'Connect Google Drive' at the top first!");
                    return;
                }
                const eventId = e.currentTarget.getAttribute('data-id');
                const eventTitle = e.currentTarget.getAttribute('data-title');
                openMediaModal(eventId, eventTitle);
            });
        });

        document.querySelectorAll('.view-media-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const eventId = e.currentTarget.getAttribute('data-id');
                const eventTitle = e.currentTarget.getAttribute('data-title');
                openGalleryModal(eventId, eventTitle);
            });
        });

        // Switch views
        yearsView.style.display = 'none';
        tripsView.style.display = 'block';
        
        // Hide top sections for a cleaner trip view
        document.getElementById('actionButtons').style.display = 'none';
        document.getElementById('viewToggle').style.display = 'none';
        
    }

    backToYearsBtn.onclick = () => {
        tripsView.style.display = 'none';
        yearsView.style.display = 'block';
        
        // Restore top sections
        if(isDriveConnected) {
            document.getElementById('actionButtons').style.display = 'flex';
            document.getElementById('viewToggle').style.display = 'flex';
            
        }
    };

    // Modal References
    const galleryModal = document.getElementById('galleryModal');
    const closeGalleryModal = document.getElementById('closeGalleryModal');
    const sliderModal = document.getElementById('sliderModal');
    const closeSliderModal = document.getElementById('closeSliderModal');
    const sliderContainer = document.getElementById('sliderContainer');
    
    // Gallery Modal Logic
    closeGalleryModal.onclick = () => galleryModal.style.display = "none";
    closeSliderModal.onclick = () => sliderModal.style.display = "none";
    
    function openGalleryModal(id, title) {
        const event = globalEvents.find(e => e.id == id);
        document.getElementById('galleryModalTitle').innerHTML = `<i class="fas fa-images"></i> ${title} Gallery`;
        
        const container = document.getElementById('galleryGridContainer');
        container.innerHTML = '';
        
        if (event && event.media && event.media.length > 0) {
            event.media.forEach((m, index) => {
                const elem = document.createElement(m.type === 'video' ? 'video' : 'img');
                elem.src = m.url;
                elem.className = 'gallery-thumbnail';
                if(m.type === 'video') elem.preload = 'metadata';
                
                elem.onclick = () => openSlider(event.media, index);
                
                // Hide if error
                elem.onerror = () => elem.style.display = 'none';
                
                container.appendChild(elem);
            });
        } else {
            container.innerHTML = '<p style="text-align:center; width:100%;">No media uploaded yet.</p>';
        }
        
        galleryModal.style.display = "block";
    }

    let currentSliderMediaList = [];

    function openSlider(mediaArray, startIndex) {
        currentSliderMediaList = mediaArray;
        sliderContainer.innerHTML = '';
        mediaArray.forEach((m, index) => {
            const item = document.createElement('div');
            item.className = 'slider-item';
            if (m.type === 'video') {
                item.innerHTML = `<video src="${m.url}" controls></video>`;
            } else {
                item.innerHTML = `<img src="${m.url}">`;
            }
            sliderContainer.appendChild(item);
        });
        
        sliderModal.style.display = 'block';
        
        // Scroll to the tapped image immediately
        requestAnimationFrame(() => {
            const itemWidth = sliderContainer.clientWidth;
            sliderContainer.scrollTo({ left: startIndex * itemWidth, behavior: 'instant' });
        });
    }

    // Delete single photo from slider
    document.getElementById('deletePhotoBtn').onclick = () => {
        if (currentSliderMediaList.length === 0) return;
        
        // Calculate which image is currently in view
        const itemWidth = sliderContainer.clientWidth;
        const scrollLeft = sliderContainer.scrollLeft;
        const currentIndex = Math.round(scrollLeft / itemWidth);
        
        const mediaToDelete = currentSliderMediaList[currentIndex];
        if (!mediaToDelete) return;

        if (confirm("Are you sure you want to permanently delete this photo?")) {
            fetch(`/api/media/${mediaToDelete.id}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        sliderModal.style.display = 'none';
                        loadEvents(); // Reloads all data and UI
                    } else {
                        alert("Error: " + data.error);
                    }
                });
        }
    };

    // Modal Display Logic
    addEventBtn.onclick = () => eventModal.style.display = "block";
    closeEventModal.onclick = () => eventModal.style.display = "none";
    closeMediaModal.onclick = () => mediaModal.style.display = "none";
    
    const dropdownMenu = document.getElementById('dropdownMenu');
    
    userAvatar.onclick = (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('show');
    };

    window.onclick = (e) => {
        if (e.target == eventModal) eventModal.style.display = "none";
        if (e.target == mediaModal) mediaModal.style.display = "none";
        if (e.target == galleryModal) galleryModal.style.display = "none";
        if (dropdownMenu && dropdownMenu.classList.contains('show') && !e.target.closest('#userProfile')) {
            dropdownMenu.classList.remove('show');
        }
    }

    function openMediaModal(id, title) {
        document.getElementById('mediaEventId').value = id;
        document.getElementById('mediaModalEventTitle').textContent = `To: ${title}`;
        mediaModal.style.display = "block";
    }

    // New Event Form Submit
    addEventForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const submitBtn = addEventForm.querySelector('.submit-btn');
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Locating & Saving...';
        submitBtn.disabled = true;

        const formData = new FormData(addEventForm);
        const data = Object.fromEntries(formData.entries());
        
        // Geocoding step
        try {
            if (data.state && data.district) {
                const query = `${data.district}, ${data.state}, India`;
                const geocodeRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
                const geocodeData = await geocodeRes.json();
                if (geocodeData && geocodeData.length > 0) {
                    data.lat = parseFloat(geocodeData[0].lat);
                    data.lng = parseFloat(geocodeData[0].lon);
                }
            }
        } catch(e) {
            console.warn("Geocoding failed", e);
        }

        try {
            const response = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                eventModal.style.display = "none";
                addEventForm.reset();
                loadEvents(); // Reload tree
                if(window.initAndPlotMap) window.initAndPlotMap();
            } else {
                alert('Error saving memory.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred.');
        } finally {
            submitBtn.textContent = 'Save Memory';
            submitBtn.disabled = false;
        }
    };

    // Global Upload Manager logic
    const umBox = document.getElementById('uploadManager');
    const umBody = document.getElementById('umBody');
    const umMinimizeBtn = document.getElementById('umMinimizeBtn');
    let uploadCount = 0;

    umMinimizeBtn.onclick = () => {
        umBox.classList.toggle('minimized');
        umMinimizeBtn.innerHTML = umBox.classList.contains('minimized') ? '<i class="fas fa-chevron-up"></i>' : '<i class="fas fa-chevron-down"></i>';
    };

    addMediaForm.onsubmit = async (e) => {
        e.preventDefault();
        const eventId = document.getElementById('mediaEventId').value;
        const formData = new FormData(addMediaForm);
        const fileInput = document.getElementById('mediaFile');
        const fileCount = fileInput.files.length;
        if (fileCount === 0) return;

        // 1. Immediately close the modal and reset it so user can keep working
        mediaModal.style.display = "none";
        addMediaForm.reset();

        // 2. Show the Upload Manager UI
        umBox.style.display = 'flex';
        umBox.classList.remove('minimized');
        umMinimizeBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
        
        // 3. Create a unique UI item for this upload task
        const uploadId = 'upload_' + Date.now();
        const itemHtml = `
            <div class="um-item" id="${uploadId}">
                <div class="um-item-top">
                    <span class="um-filename"><i class="fas fa-cloud-upload-alt"></i> ${fileCount} file(s)</span>
                    <span class="um-status loading"><i class="fas fa-spinner fa-spin"></i></span>
                </div>
                <div class="um-progress-bar-bg">
                    <div class="um-progress-bar-fill indeterminate"></div>
                </div>
            </div>
        `;
        umBody.insertAdjacentHTML('afterbegin', itemHtml);
        uploadCount++;

        // 4. Perform the background fetch
        try {
            const response = await fetch(`/api/events/${eventId}/media`, {
                method: 'POST',
                body: formData
            });

            const uploadItem = document.getElementById(uploadId);
            const statusIcon = uploadItem.querySelector('.um-status');
            const progressBar = uploadItem.querySelector('.um-progress-bar-fill');

            if (response.ok) {
                // Success!
                statusIcon.className = 'um-status success';
                statusIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
                progressBar.classList.remove('indeterminate');
                progressBar.style.width = '100%';
                
                // Silently reload events so the new photos are available in the gallery without refreshing
                loadEvents(); 
            } else {
                // Server Error
                const err = await response.json();
                statusIcon.className = 'um-status error';
                statusIcon.innerHTML = '<i class="fas fa-exclamation-circle" title="' + (err.error || 'Failed') + '"></i>';
                progressBar.classList.remove('indeterminate');
                progressBar.style.background = '#e74c3c';
                progressBar.style.width = '100%';
            }
        } catch (error) {
            // Network Error
            const uploadItem = document.getElementById(uploadId);
            if(uploadItem) {
                const statusIcon = uploadItem.querySelector('.um-status');
                const progressBar = uploadItem.querySelector('.um-progress-bar-fill');
                statusIcon.className = 'um-status error';
                statusIcon.innerHTML = '<i class="fas fa-times-circle" title="Network Error"></i>';
                progressBar.classList.remove('indeterminate');
                progressBar.style.background = '#e74c3c';
                progressBar.style.width = '100%';
            }
        } finally {
            // Auto-hide the Upload Manager after 4 seconds if all uploads are complete
            setTimeout(() => {
                const loadingItems = document.querySelectorAll('.um-status.loading');
                if (loadingItems.length === 0) {
                    umBox.style.display = 'none';
                    // Optional: clear out the old items so it's fresh next time
                    umBody.innerHTML = '';
                }
            }, 4000);
        }
    };

    // Initial load
    checkDriveStatus();
});

// --- Phase 4: Future Plans JS ---
document.addEventListener('DOMContentLoaded', () => {
    const viewToggle = document.getElementById('viewToggle');
    const navMemoriesBtn = document.getElementById('navMemoriesBtn');
    const navPlansBtn = document.getElementById('navPlansBtn');
    
    const yearsView = document.getElementById('yearsView');
    const tripsView = document.getElementById('tripsView');
    const plansView = document.getElementById('plansView');
    
    const addEventBtn = document.getElementById('addEventBtn');
    const addPlanBtn = document.getElementById('addPlanBtn');
    
    const planModal = document.getElementById('planModal');
    const closePlanModal = document.getElementById('closePlanModal');
    const addPlanForm = document.getElementById('addPlanForm');
    
    if(!navMemoriesBtn) return; // Wait for load

    // Toggling Views
    navMemoriesBtn.onclick = () => {
        navMemoriesBtn.classList.add('active');
        navPlansBtn.classList.remove('active');
        const mapBtn1 = document.getElementById('navMapBtn');
        if(mapBtn1) mapBtn1.classList.remove('active');
        const mapV1 = document.getElementById('mapView');
        if(mapV1) mapV1.style.display = 'none';
        plansView.style.display = 'none';
        yearsView.style.display = 'block';
        tripsView.style.display = 'none'; // reset to years
        addEventBtn.style.display = 'inline-block';
        addPlanBtn.style.display = 'none';
    };
    
    navPlansBtn.onclick = () => {
        navPlansBtn.classList.add('active');
        navMemoriesBtn.classList.remove('active');
        const mapBtn2 = document.getElementById('navMapBtn');
        if(mapBtn2) mapBtn2.classList.remove('active');
        const mapV2 = document.getElementById('mapView');
        if(mapV2) mapV2.style.display = 'none';
        yearsView.style.display = 'none';
        tripsView.style.display = 'none';
        plansView.style.display = 'grid';
        addEventBtn.style.display = 'none';
        addPlanBtn.style.display = 'inline-block';
        loadPlans();
    };
    
    // Modal Logic
    addPlanBtn.onclick = () => { planModal.style.display = 'block'; };
    closePlanModal.onclick = () => { planModal.style.display = 'none'; };
    
    // Form Submit
    addPlanForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = addPlanForm.querySelector('button[type="submit"]');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;
        
        const data = Object.fromEntries(new FormData(addPlanForm));
        try {
            const res = await fetch('/api/plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if(res.ok) {
                planModal.style.display = 'none';
                addPlanForm.reset();
                loadPlans();
            }
        } catch(err) {
            console.error(err);
        } finally {
            btn.innerHTML = '<i class="fas fa-save"></i> Save Plan';
            btn.disabled = false;
        }
    };
    
    // Load Plans
    window.loadPlans = async () => {
        try {
            const res = await fetch('/api/plans');
            const plans = await res.json();
            renderPlans(plans);
            if(window.updateStatsDashboard) window.updateStatsDashboard();
        } catch(err) {
            console.error(err);
        }
    };
    
    function renderPlans(plans) {
        plansView.innerHTML = '';
        if(plans.length === 0) {
            plansView.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">No future plans yet. Dream big!</p>';
            return;
        }
        
        plans.sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(plan => {
            const el = document.createElement('div');
            el.className = 'plan-ticket';
            const fDate = new Date(plan.date).toLocaleDateString('en-US', { day:'numeric', month:'long', year:'numeric'});
            el.innerHTML = `
                <div class="plan-title"><i class="fas fa-map-pin"></i> ${plan.venue}</div>
                <div class="plan-date"><i class="far fa-calendar-alt"></i> ${fDate}</div>
                <div class="plan-note">"${plan.note || 'No notes'}"</div>
                <div class="plan-meta">
                    <span><i class="fas fa-wallet"></i> ₹${plan.budget || 0}</span>
                    ${plan.map_link ? `<a href="${plan.map_link}" target="_blank" style="color:#4ecdc4;"><i class="fas fa-external-link-alt"></i> View Map</a>` : ''}
                </div>
                <div class="plan-actions">
                    <button class="primary-btn" style="padding: 5px 10px; font-size: 0.8rem; background: rgba(255,107,107,0.8);" onclick="deletePlan('${plan.id}')"><i class="fas fa-trash"></i> Cancel Plan</button>
                </div>
            `;
            plansView.appendChild(el);
        });
    }
    
    window.deletePlan = async (id) => {
        if(confirm("Are you sure you want to delete this future plan?")) {
            await fetch('/api/plans/' + id, { method: 'DELETE' });
            loadPlans();
        }
    };
});

    // --- Phase 5 (Step 1): Update Stats Dashboard ---
    window.updateStatsDashboard = async () => {
        try {
            // Fetch both in parallel
            const [eventsRes, plansRes] = await Promise.all([
                fetch('/api/events'),
                fetch('/api/plans')
            ]);
            
            const events = await eventsRes.json();
            const plans = await plansRes.json();
            
            const totalTrips = events.length;
            const totalMemories = events.reduce((acc, ev) => acc + (ev.media ? ev.media.length : 0), 0);
            const totalPlans = plans.length;
            
            document.getElementById('statTotalTrips').textContent = totalTrips;
            document.getElementById('statTotalMemories').textContent = totalMemories;
            document.getElementById('statTotalPlans').textContent = totalPlans;
            
            
        } catch(err) {
            console.error('Error updating stats:', err);
        }
    };



// --- Phase 6: Life Map & Location Data ---
document.addEventListener('DOMContentLoaded', () => {
    const navMapBtn = document.getElementById('navMapBtn');
    const navMemoriesBtn = document.getElementById('navMemoriesBtn');
    const navPlansBtn = document.getElementById('navPlansBtn');
    const yearsView = document.getElementById('yearsView');
    const tripsView = document.getElementById('tripsView');
    const plansView = document.getElementById('plansView');
    const mapView = document.getElementById('mapView');
    const addEventBtn = document.getElementById('addEventBtn');
    const addPlanBtn = document.getElementById('addPlanBtn');

    if(navMapBtn) {
        navMapBtn.onclick = () => {
            navMapBtn.classList.add('active');
            if(navMemoriesBtn) navMemoriesBtn.classList.remove('active');
            if(navPlansBtn) navPlansBtn.classList.remove('active');
            
            yearsView.style.display = 'none';
            tripsView.style.display = 'none';
            if(plansView) plansView.style.display = 'none';
            mapView.style.display = 'block';
            
            addEventBtn.style.display = 'none';
            if(addPlanBtn) addPlanBtn.style.display = 'none';
            
            if(window.initAndPlotMap) window.initAndPlotMap();
        };
    }

    // States & Districts Logic
    const stateSelect = document.getElementById('state');
    const districtList = document.getElementById('district-list');
    let indiaData = [];

    fetch('https://raw.githubusercontent.com/sab99r/Indian-States-And-Districts/master/states-and-districts.json')
        .then(res => res.json())
        .then(data => {
            if(data && data.states) {
                indiaData = data.states;
                indiaData.forEach(stateObj => {
                    let opt = document.createElement('option');
                    opt.value = stateObj.state;
                    opt.textContent = stateObj.state;
                    if(stateSelect) stateSelect.appendChild(opt);
                });
            }
        })
        .catch(err => console.error('Could not load states data', err));

    if(stateSelect) {
        stateSelect.addEventListener('change', (e) => {
            if(districtList) districtList.innerHTML = '';
            document.getElementById('district').value = '';
            const selectedState = e.target.value;
            const stateObj = indiaData.find(s => s.state === selectedState);
            if(stateObj && districtList) {
                stateObj.districts.forEach(dist => {
                    let opt = document.createElement('option');
                    opt.value = dist;
                    districtList.appendChild(opt);
                });
            }
        });
    }
});

let lifeMap = null;
let mapMarkers = [];

let worldLayer = null;
let countryLayer = null;

// Unique, colorful pastel palette for countries/states
const colorPalette = [
    '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
    '#E6B3FF', '#FFB3E6', '#B3FFF3', '#FFE6B3', '#D1FFB3',
    '#B3D1FF', '#FFC9B3', '#F3B3FF', '#B3FFC9', '#FFF3B3',
    '#FFD1A9', '#A9FFD1', '#D1A9FF', '#FFA9D1', '#A9D1FF'
];
// Intense versions for hover states
const intensePalette = [
    '#FF6B7A', '#FFB74D', '#FFD600', '#00E676', '#42A5F5',
    '#AB47BC', '#EC407A', '#26C6DA', '#FFA726', '#9CCC65',
    '#5C6BC0', '#FF7043', '#D500F9', '#00C853', '#FDD835',
    '#FF9800', '#00BFA5', '#651FFF', '#F50057', '#2979FF'
];

function getFeatureColor(name, isHover = false) {
    if (!name) return isHover ? '#888' : '#eee';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    let index = Math.abs(hash) % colorPalette.length;
    return isHover ? intensePalette[index] : colorPalette[index];
}

window.initAndPlotMap = async function() {
    if (!lifeMap && typeof L !== 'undefined') {
        lifeMap = L.map('lifeMap', {
            zoomControl: true,
            attributionControl: false
        }).setView([20.5937, 78.9629], 4); 
        
        document.getElementById('lifeMap').style.background = '#e3f2fd';
        
        const backBtn = document.createElement('button');
        backBtn.id = 'backToWorldBtn';
        backBtn.innerHTML = '<i class="fas fa-globe"></i> Back to World Map';
        backBtn.className = 'primary-btn';
        backBtn.style.cssText = 'position: absolute; top: 20px; right: 20px; z-index: 1000; display: none; padding: 10px 20px; font-size: 14px; background: rgba(0,0,0,0.7); border-radius: 8px; color: white; cursor: pointer; border: none; outline: none;';
        document.getElementById('mapView').appendChild(backBtn);
        
        backBtn.onclick = () => {
            if (countryLayer) lifeMap.removeLayer(countryLayer);
            if (worldLayer) lifeMap.addLayer(worldLayer);
            lifeMap.setView([20.5937, 78.9629], 4);
            backBtn.style.display = 'none';
            mapMarkers.forEach(m => m.bringToFront());
        };
        
        try {
            const res = await fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json');
            const worldData = await res.json();
            
            worldLayer = L.geoJSON(worldData, {
                style: function(feature) {
                    let name = feature.properties.name || "Unknown";
                    return { fillColor: getFeatureColor(name, false), color: '#ffffff', weight: 1, fillOpacity: 0.9 };
                },
                onEachFeature: function(feature, layer) {
                    let name = feature.properties.name || "Unknown";
                    layer.bindTooltip(name, {className: 'map-label', direction: 'center', permanent: false});
                    
                    layer.on('mouseover', function(e) {
                        layer.setStyle({ fillColor: getFeatureColor(name, true), color: '#ffffff', weight: 2 });
                        layer.bringToFront();
                        mapMarkers.forEach(m => m.bringToFront());
                    });
                    layer.on('mouseout', function(e) {
                        worldLayer.resetStyle(layer);
                    });
                    layer.on('click', async function(e) {
                        lifeMap.fitBounds(layer.getBounds());
                        if (name === "India") {
                            backBtn.style.display = 'block';
                            lifeMap.removeLayer(worldLayer);
                            loadIndiaStates();
                        }
                    });
                }
            }).addTo(lifeMap);
            
        } catch(e) { console.error("Error loading map", e); }
    }
    
    if (lifeMap) {
        setTimeout(() => lifeMap.invalidateSize(), 100);
        plotMarkers();
    }
};

async function loadIndiaStates() {
    if (countryLayer) {
        lifeMap.addLayer(countryLayer);
        mapMarkers.forEach(m => m.bringToFront());
        return;
    }
    try {
        const res = await fetch('https://raw.githubusercontent.com/geohacker/india/master/state/india_telengana.geojson');
        const indiaData = await res.json();
        countryLayer = L.geoJSON(indiaData, {
            style: function(feature) {
                let name = feature.properties.NAME_1 || feature.properties.st_nm || "State";
                return { fillColor: getFeatureColor(name, false), color: '#ffffff', weight: 1, fillOpacity: 0.9 };
            },
            onEachFeature: function(feature, layer) {
                let name = feature.properties.NAME_1 || feature.properties.st_nm || "State";
                layer.bindTooltip(name, {className: 'map-label', direction: 'center', permanent: false});
                
                layer.on('mouseover', function(e) {
                    layer.setStyle({ fillColor: getFeatureColor(name, true), color: '#ffffff', weight: 2 });
                    layer.bringToFront();
                    mapMarkers.forEach(m => m.bringToFront());
                });
                layer.on('mouseout', function(e) {
                    countryLayer.resetStyle(layer);
                });
                layer.on('click', function(e) {
                    lifeMap.fitBounds(layer.getBounds());
                });
            }
        }).addTo(lifeMap);
        mapMarkers.forEach(m => m.bringToFront());
    } catch(e) { console.error("India data error", e); }
}

function plotMarkers() {
    mapMarkers.forEach(m => lifeMap.removeLayer(m));
    mapMarkers = [];
    if (window.globalEvents) {
        window.globalEvents.forEach(ev => {
            if (ev.lat && ev.lng) {
                let photoUrl = (ev.media && ev.media.length > 0 && ev.media[0].type === 'image') ? ev.media[0].url : null;
                let popupContent = `<div style="text-align:center; min-width:120px;">
                    <h4 style="margin: 0 0 5px 0;">${ev.title}</h4>
                    <p style="margin: 0 0 5px 0; font-size:12px;">${ev.district || ''}, ${ev.state || ''}</p>
                    ${photoUrl ? `<img src="${photoUrl}" style="width:100px; height:70px; object-fit:cover; border-radius:5px; margin-top:5px;" />` : ''}
                </div>`;
                
                let redIcon = new L.Icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });

                let marker = L.marker([ev.lat, ev.lng], {icon: redIcon}).addTo(lifeMap).bindPopup(popupContent);
                mapMarkers.push(marker);
            }
        });
    }
}
