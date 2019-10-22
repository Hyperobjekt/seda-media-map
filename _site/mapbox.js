var SHEET_URL = 'https://spreadsheets.google.com/feeds/list/1vDvjR4Tgj9NnbLZwmSyJKDrEAE4gAHf0NUCjp2i7D90/1/public/values?alt=json'
mapboxgl.accessToken = 'pk.eyJ1IjoiZXZpY3Rpb24tbGFiIiwiYSI6ImNqY20zamVpcTBwb3gzM28yb292YzM3dXoifQ.uKgAjsMd4qkJNqEtr3XyPQ';
var map = new mapboxgl.Map({
    container: 'map',
    style: './style.json',
    center: [-103.59179687498357, 40.66995747013945],
    zoom: 3
});
var pymChild = new pym.Child();

// Date filter placeholder vars
var filter_start_date = null;
var filter_end_date = null;

var mediaData = {};

map.on('loaded', function() {
    pymChild.sendHeight();
});

map.on('mouseenter', 'clusters', function() {
    map.getCanvas().style.cursor = 'pointer';
});
map.on('mouseleave', 'clusters', function() {
    map.getCanvas().style.cursor = '';
});

function createTooltip(coords, features) {
    var content = document.createElement('div');
    content.innerHTML = features.map(function (f) {
        return '<p>' + f.properties.outlet + ' <a target="_blank" href="' +
            f.properties.link + '">' + f.properties.title + '</a></p>';
    }).join('');
    new mapboxgl.Popup()
        .setLngLat(coords)
        .setDOMContent(content)
        .addTo(map);
    content.parentNode.className += ' modal-content modal-header';
    document.querySelector('.mapboxgl-popup-close-button').className += ' close';
}

function featuresOnClick(e) {
    if (e.features.length === 0) { return; }
    var coords = e.features[0].geometry.coordinates;
    if (!e.features[0].properties.hasOwnProperty('point_count')) {
        createTooltip(coords, e.features);
        return;
    }
    var r = 35;

    var bounds = map.getBounds();
    var bb = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    var pt = map.project(coords);
    var sw = map.unproject({ x: pt.x - r, y: pt.y - r });
    var ne = map.unproject({ x: pt.x + r, y: pt.y + r });
    var bbox = [sw.lng, sw.lat, ne.lng, ne.lat];

    var index = supercluster({ radius: r, maxZoom: 14 });
    index.load(map.getSource('media').serialize().data.features);
    var clusterCount = e.features[0].properties.point_count;
    var clusters = index.getClusters(bb, Math.floor(map.getZoom()));
    var matchClusters = clusters.filter(function (c) {
        return (
            c.properties.point_count === clusterCount &&
            turf.booleanContains(turf.bboxPolygon(bbox), c)
        );
    });
    if (matchClusters.length === 1) {
        var clusterId = matchClusters[0].properties.cluster_id;
        var clusterFeatures = index.getLeaves(clusterId, 1000);
        createTooltip(coords, clusterFeatures);
    }
}
map.on('click', 'clusters', featuresOnClick);

var req = new XMLHttpRequest();
req.addEventListener("load", function () {
    var rows = JSON.parse(this.responseText).feed.entry;
    var properties = Object.keys(rows[0])
        .filter(function (p) { return p.startsWith("gsx$"); })
        .map(function (p) { return p.substr(4); });

    var items = rows.map(function (r) {
        var row = {};
        properties.forEach(function (p) {
            row[p] = r["gsx$" + p].$t === "" ? null : r["gsx$" + p].$t;
            if (['latitude', 'longitude'].indexOf(p) !== -1) {
                row[p] = +row[p];
            }
            if (row[p] === null) {
                row[p] = '';
            }
        });
        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [row.longitude, row.latitude]
            },
            properties: row
        };
    });
    mediaData = { type: 'FeatureCollection', features: items };
    // console.log(mediaData);
    map.getSource('media').setData(mediaData);
});
req.open("GET", SHEET_URL);
req.send();

jQuery(document).ready(function() {
    // console.log( "ready!" );
    // Set date range max
    function setMaxDate() {
        var date = new Date();  //it returns the date
        var month = date.getMonth();
        // console.log('month = ' + month);
        var year = date.getFullYear();
        // console.log('year = ' + year);
        $('#end_month_select').val(month).change();
        $('#end_year_select').val(year).change();
    }
    setMaxDate();

    // Set up button to display filter(switch)
    $('#filters_button').click(function(e) {
        if ($('#filters-parent').length >= 1) {
            $('#filters-parent').toggleClass('show');
        }
    });

    $('#filter_bydate').click(function(e) {
        // Set filter range from form elements.
        var start = new Date(
            $('#start_year_select').val(),
            $('#start_month_select').val()
        );
        // console.log(start);
        filter_start_date = start;
        // End, have to take the last day of the month,
        // which we will get by stepping back from the subsequent month.
        var month = Number($('#end_month_select').val());
        var year = Number($('#end_year_select').val());
        if (month === 11) {
            month = 0;
            year = year + 1;
        } else {
            month = month + 1;
        }
        var end = new Date(year, month, 0);
        // console.log(end);
        filter_end_date = end;
        var newData = { type: 'FeatureCollection',
            features: (mediaData.features).filter(function(obj) {
                var pubDate = new Date(obj.properties.date);
                return (pubDate >=  filter_start_date) && (pubDate <= filter_end_date);
            })
        };
        // console.log(newData);
        // Reload the map.
        map.getSource('media').setData(newData);
    });

    /**
     * Validate the end range, removing months beyond the current
     * month if the selected year is the current year.
     * @return null
     */
    function validateEndRange(el) {
        // console.log('validateEndRange');
        // Get element and sibling
        var $el = $(el);
        var $month = $el.prev('.month');
        // Get current datetime
        var now = new Date();
        var thisMonth = now.getMonth();
        var thisYear = now.getFullYear();
        // Minimal max month validation against current year
        if ($el.val() == thisYear) {
            // console.log('this year is selected');
            $month.find('option').each(function() {
                if (Number(this.value) > thisMonth) {
                    // console.log('number is greater than present month');
                    $(this).attr('disabled', 'disabled');
                } else {
                    $(this).removeAttr('disabled');
                    $month.val(thisMonth);
                }
            });
        } else {
            $month.find('option').each(function() {
                $(this).removeAttr('disabled');
            });
        }
    }
    $('#end_year_select, #start_year_select').on('change', function(e) {
        validateEndRange(e.target);
    });
    validateEndRange('#end_year_select');
    /**
     * Validate full date range, ensuring that end date selections
     * are after selected start date.
     * @return null
     */
    function validateFullDateRange() {
        // console.log('validateFullDateRange()');
        var start_month = Number($('#start_month_select').val());
        var start_year = Number($('#start_year_select').val());
        var end_month = Number($('#end_month_select').val());
        var end_year = Number($('#end_year_select').val());

        if (end_year === start_year) {
            // console.log('End year equal to start year');
            // When end year same as start year,
            // if end month less than start month,
            // validation error. Else proceed.
            if (end_month < start_month) {
                // console.log('invalid, disabling');
                // Disable filter button
                $('#filter_bydate').prop('disabled', 'disabled').text('Invalid date selection');
                // Add invalid classes
                $('#end_year_select, #end_month_select').addClass('select-invalid');
            } else {
                // console.log('valid, enabling');
                // Enable filter button
                $('#filter_bydate').prop('disabled', false).text('Go');
                // Add invalid classes
                $('#end_year_select, #end_month_select').removeClass('select-invalid');
            }
        } else if (end_year < start_year) {
            // When end year less than start year,
            // validation error.
            // console.log('End year less than start year');
            // Disable filter button
            $('#filter_bydate').prop('disabled', 'disabled').text('Invalid date selection');
            // Add invalid classes
            $('#end_year_select, #end_month_select').addClass('select-invalid');
        } else {
            // Else remove any preceding validation
            // error warnings.
            // console.log('valid, enabling');
            // Enable filter button
            $('#filter_bydate').prop('disabled', false).text('Go');
            // Add invalid classes
            $('#end_year_select, #end_month_select').removeClass('select-invalid');
        }
    }
    $('#start_month_select, #start_year_select, #end_month_select, #end_year_select').on('change', function() {
        validateFullDateRange();
    });
    validateEndRange();
});