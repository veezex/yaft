"""Run with the pinned Pyfa checkout on PYTHONPATH and aligned eve.db available."""
import json
import sys

sys._called_from_test = True
import eos.db
from eos.const import FittingModuleState
from eos.saveddata.character import Character
from eos.saveddata.damagePattern import DamagePattern
from eos.saveddata.drone import Drone
from eos.saveddata.fit import Fit
from eos.saveddata.module import Module
from eos.saveddata.ship import Ship

states = {'offline': -1, 'online': 0, 'active': 1, 'overheated': 2}
character = Character.getAll5()


def calculate(case):
    data = case['fit']
    fit = Fit()
    fit.ship = Ship(eos.db.getItem(data['shipTypeId']))
    fit.character = character if data['skillProfileId'] == 'all-v' else Character.getAll0()
    fit.damagePattern = DamagePattern(25, 25, 25, 25)
    for item in data['items']:
        if item['group'] == 'drone':
            drone = Drone(eos.db.getItem(item['typeId']))
            drone.amount = item['quantity']
            drone.amountActive = item.get('activeQuantity', 0)
            fit.drones.append(drone)
            drone.owner = fit
        else:
            module = Module(eos.db.getItem(item['typeId']))
            module.state = FittingModuleState(min(states[item.get('state', 'online')], int(module.getMaxState())))
            if 'charge' in item:
                module.charge = eos.db.getItem(item['charge']['typeId'])
            fit.modules.append(module)
            module.owner = fit

    fit.calculateModifiedAttributes()
    ship = fit.ship.getModifiedItemAttr
    values = {
        'cpuUsed': fit.cpuUsed,
        'cpuMax': ship('cpuOutput'),
        'powerUsed': fit.pgUsed,
        'powerMax': ship('powerOutput'),
        'calibrationUsed': fit.calibrationUsed,
        'calibrationMax': ship('upgradeCapacity'),
        'shieldHp': fit.hp['shield'],
        'armorHp': fit.hp['armor'],
        'hullHp': fit.hp['hull'],
        'ehpTotal': sum(fit.ehp.values()),
        'hull.em': (1 - ship('emDamageResonance')) * 100,
        'velocity': ship('maxVelocity'),
        'align': fit.alignTime,
        'lockRange': ship('maxTargetRange'),
        'targets': fit.maxTargets,
        'weaponDps': fit.getWeaponDps().total,
        'droneDps': fit.getDroneDps().total,
        'totalDps': fit.getTotalDps().total,
        'alphaStrike': fit.getTotalVolley().total,
        'mining': sum(module.getMiningYPS() for module in fit.modules) * 60,
        'remoteShield': fit.getRemoteReps().shield,
        'capacitor': ship('capacitorCapacity'),
        'capacitorStable': bool(fit.capStable),
        'capacitorLevel': fit.capState if fit.capStable else None,
        'capacitorTime': None if fit.capStable else fit.capState,
    }
    return {**case, 'expected': {key: values[key] for key in case['metrics']}}


if len(sys.argv) == 2:
    with open(sys.argv[1], encoding='utf-8') as input_file:
        cases = json.load(input_file)
else:
    cases = json.load(sys.stdin)
print(json.dumps([calculate(case) for case in cases]))
